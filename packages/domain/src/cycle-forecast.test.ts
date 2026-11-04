import { describe, expect, it } from "vitest";
import {
  CycleConfigError,
  CycleDateError,
  forecastCycle,
  resolveCycleConfig,
} from "./cycle-forecast";

const TODAY = "2026-12-31";

/** Period starts separated by the given cycle lengths, beginning at `first`. */
function starts(first: string, lengths: number[]): string[] {
  const result = [first];
  let ms = Date.parse(`${first}T00:00:00Z`);
  for (const length of lengths) {
    ms += length * 86_400_000;
    result.push(new Date(ms).toISOString().slice(0, 10));
  }
  return result;
}

describe("resolveCycleConfig", () => {
  it("uses 28 and 5 days by default", () => {
    expect(resolveCycleConfig()).toMatchObject({
      cycleLength: 28,
      periodLength: 5,
    });
  });

  it("accepts the boundary values", () => {
    expect(
      resolveCycleConfig({ cycleLength: 21, periodLength: 2 }),
    ).toMatchObject({
      cycleLength: 21,
      periodLength: 2,
    });
    expect(
      resolveCycleConfig({ cycleLength: 45, periodLength: 10 }),
    ).toMatchObject({
      cycleLength: 45,
      periodLength: 10,
    });
  });

  it.each([
    { cycleLength: 20 },
    { cycleLength: 46 },
    { periodLength: 1 },
    { periodLength: 11 },
  ])("rejects %o", (config) => {
    expect(() => resolveCycleConfig(config)).toThrow(CycleConfigError);
  });

  it("rejects non-integer values", () => {
    expect(() => resolveCycleConfig({ cycleLength: 28.5 })).toThrow(
      CycleConfigError,
    );
  });

  it('gives 28 and 5 days with low confidence for "I don\'t know"', () => {
    expect(resolveCycleConfig({ unknown: true })).toEqual({
      cycleLength: 28,
      periodLength: 5,
      confidence: "low",
    });
  });
});

describe("cycle length", () => {
  it.each([1, 2, 3])("uses the config with %i recorded periods", (count) => {
    const periodStarts = starts(
      "2026-01-01",
      Array.from({ length: count - 1 }, () => 30),
    );
    const result = forecastCycle({
      periodStarts,
      today: TODAY,
      config: { cycleLength: 26 },
    });
    expect(result.cycleLength).toBe(26);
    expect(result.cycleLengthSource).toBe("config");
    expect(result.confidence).toBe("low");
  });

  it("uses the config with only 2 full cycles", () => {
    const periodStarts = starts("2026-01-01", [30, 30]);
    const result = forecastCycle({ periodStarts, today: TODAY });
    expect(result.cycleLengthSource).toBe("config");
  });

  it("averages 3 full cycles", () => {
    const periodStarts = starts("2026-01-01", [27, 29, 31]);
    const result = forecastCycle({ periodStarts, today: TODAY });
    expect(result.cycleLength).toBe(29);
    expect(result.cycleLengthSource).toBe("history");
    expect(result.confidence).toBe("normal");
  });

  it("averages only the 6 latest cycles", () => {
    const periodStarts = starts("2026-01-01", [40, 30, 30, 30, 30, 30, 30]);
    const result = forecastCycle({ periodStarts, today: TODAY });
    expect(result.cycleLength).toBe(30);
  });

  it("sorts unordered period starts", () => {
    const periodStarts = starts("2026-01-01", [30, 30, 30]).reverse();
    expect(forecastCycle({ periodStarts, today: TODAY }).cycleLength).toBe(30);
  });
});

describe("forecast", () => {
  it("adds the cycle length to the latest start with a ±2 day minimum", () => {
    const result = forecastCycle({
      periodStarts: ["2026-03-10"],
      today: "2026-03-20",
    });
    expect(result).toMatchObject({
      nextStart: "2026-04-07",
      rangeStart: "2026-04-05",
      rangeEnd: "2026-04-09",
    });
  });

  it("keeps ±2 days when the deviation is below 2", () => {
    const periodStarts = starts("2026-01-01", [28, 29, 28, 29]);
    const result = forecastCycle({ periodStarts, today: TODAY });
    expect(result.rangeStart).toBe(shift(result.nextStart, -2));
    expect(result.rangeEnd).toBe(shift(result.nextStart, 2));
  });

  it("widens the range to the standard deviation when it exceeds 2 days", () => {
    // cycles 24, 34, 24, 34: mean 29, standard deviation 5
    const periodStarts = starts("2026-01-01", [24, 34, 24, 34]);
    const result = forecastCycle({ periodStarts, today: TODAY });
    expect(result.cycleLength).toBe(29);
    expect(result.rangeStart).toBe(shift(result.nextStart, -5));
    expect(result.rangeEnd).toBe(shift(result.nextStart, 5));
  });

  it("crosses month and year ends and leap days", () => {
    expect(
      forecastCycle({ periodStarts: ["2026-12-20"], today: "2026-12-25" })
        .nextStart,
    ).toBe("2027-01-17");
    expect(
      forecastCycle({ periodStarts: ["2028-02-10"], today: "2028-02-11" })
        .nextStart,
    ).toBe("2028-03-09");
  });
});

describe("estimate marker and result shape", () => {
  it("always marks the result as an estimate", () => {
    const inputs = [
      { periodStarts: ["2026-01-01"], today: TODAY },
      {
        periodStarts: ["2026-01-01"],
        today: TODAY,
        config: { unknown: true as const },
      },
      { periodStarts: starts("2026-01-01", [28, 28, 28]), today: TODAY },
    ];
    for (const input of inputs) {
      expect(forecastCycle(input).isEstimate).toBe(true);
    }
  });

  it("returns no fertility, safe days or pregnancy fields", () => {
    const result = forecastCycle({
      periodStarts: ["2026-01-01"],
      today: TODAY,
    });
    expect(Object.keys(result).sort()).toEqual([
      "confidence",
      "cycleLength",
      "cycleLengthSource",
      "isEstimate",
      "nextStart",
      "rangeEnd",
      "rangeStart",
    ]);
  });

  it('keeps low confidence for "I don\'t know" even with a history', () => {
    const result = forecastCycle({
      periodStarts: starts("2026-01-01", [30, 30, 30]),
      today: TODAY,
      config: { unknown: true },
    });
    expect(result.confidence).toBe("low");
    const few = forecastCycle({
      periodStarts: ["2026-01-01"],
      today: TODAY,
      config: { unknown: true },
    });
    expect(few).toMatchObject({ cycleLength: 28, confidence: "low" });
  });
});

describe("dates", () => {
  it.each([
    "2026-1-01",
    "2026-02-30",
    "2026-13-01",
    "01.02.2026",
    "2026-01-01T00:00:00Z",
  ])("rejects the invalid date %s", (date) => {
    expect(() => forecastCycle({ periodStarts: [date], today: TODAY })).toThrow(
      CycleDateError,
    );
    expect(() =>
      forecastCycle({ periodStarts: ["2026-01-01"], today: date }),
    ).toThrow(CycleDateError);
  });

  it("rejects a period start later than today", () => {
    expect(() =>
      forecastCycle({ periodStarts: ["2026-05-02"], today: "2026-05-01" }),
    ).toThrow(CycleDateError);
  });

  it("rejects an empty history", () => {
    expect(() => forecastCycle({ periodStarts: [], today: TODAY })).toThrow(
      CycleDateError,
    );
  });

  it("propagates configuration errors", () => {
    expect(() =>
      forecastCycle({
        periodStarts: ["2026-01-01"],
        today: TODAY,
        config: { cycleLength: 10 },
      }),
    ).toThrow(CycleConfigError);
  });
});

function shift(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
