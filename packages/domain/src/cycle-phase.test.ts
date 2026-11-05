/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { CycleDateError } from "./cycle-forecast";
import { type CyclePhase, estimateCyclePhase } from "./cycle-phase";
import source from "./cycle-phase.ts?raw";

const TODAY = "2027-12-31";

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Period starts separated by the given cycle lengths, beginning at `first`. */
function starts(first: string, lengths: number[]): string[] {
  const result = [first];
  for (const length of lengths) {
    result.push(addDays(result[result.length - 1] as string, length));
  }
  return result;
}

function phases(
  periodStarts: string[],
  length: number,
  config?: Parameters<typeof estimateCyclePhase>[0]["config"],
): CyclePhase[] {
  const last = periodStarts[periodStarts.length - 1] as string;
  return Array.from(
    { length },
    (_, d) =>
      estimateCyclePhase({
        date: addDays(last, d),
        periodStarts,
        today: TODAY,
        config,
      }).phase,
  );
}

function runs(list: CyclePhase[]): [CyclePhase, number][] {
  const result: [CyclePhase, number][] = [];
  for (const phase of list) {
    const tail = result[result.length - 1];
    if (tail?.[0] === phase) tail[1] += 1;
    else result.push([phase, 1]);
  }
  return result;
}

describe("28-day cycle", () => {
  const history = starts("2026-01-01", [28, 28, 28]);

  it("splits the cycle into the five phases", () => {
    expect(runs(phases(history, 28))).toEqual([
      ["menstruation", 5],
      ["follicular", 7],
      ["periovulatory", 5],
      ["luteal", 6],
      ["premenstrual", 5],
    ]);
  });

  it("is regular with normal confidence", () => {
    expect(
      estimateCyclePhase({
        date: "2026-03-30",
        periodStarts: history,
        today: TODAY,
      }),
    ).toEqual({
      phase: "menstruation",
      isIrregular: false,
      confidence: "normal",
      isEstimate: true,
    });
  });

  it("uses recorded period days instead of the forecast length", () => {
    const last = history[history.length - 1] as string;
    const periodDays = [0, 1, 2].map((d) => addDays(last, d));
    const phase = (d: number) =>
      estimateCyclePhase({
        date: addDays(last, d),
        periodStarts: history,
        today: TODAY,
        periodDays,
      }).phase;
    expect(phase(2)).toBe("menstruation");
    expect(phase(3)).toBe("follicular");
  });

  it("projects dates after the forecast next start", () => {
    const last = history[history.length - 1] as string;
    const phase = estimateCyclePhase({
      date: addDays(last, 28 + 1),
      periodStarts: history,
      today: TODAY,
    }).phase;
    expect(phase).toBe("menstruation");
  });

  it("rejects a date before the last period start", () => {
    expect(() =>
      estimateCyclePhase({
        date: "2026-03-01",
        periodStarts: history,
        today: TODAY,
      }),
    ).toThrow(CycleDateError);
  });
});

describe("35-day cycle", () => {
  const history = starts("2026-01-01", [35, 35, 35]);

  it("places the periovulatory window 14 days before the next period", () => {
    expect(runs(phases(history, 35))).toEqual([
      ["menstruation", 5],
      ["follicular", 14],
      ["periovulatory", 5],
      ["luteal", 6],
      ["premenstrual", 5],
    ]);
  });

  it("is regular with normal confidence", () => {
    const result = estimateCyclePhase({
      date: "2026-05-01",
      periodStarts: history,
      today: TODAY,
    });
    expect(result.isIrregular).toBe(false);
    expect(result.confidence).toBe("normal");
  });
});

describe("irregular cycle", () => {
  it("flags a deviation above 7 days", () => {
    const result = estimateCyclePhase({
      date: "2026-06-01",
      periodStarts: starts("2026-01-01", [21, 40, 22, 41]),
      today: TODAY,
    });
    expect(result.isIrregular).toBe(true);
  });

  it("does not flag a deviation of exactly 7 days", () => {
    // Lengths 21 and 35 alternate: mean 28, deviation 7.
    const result = estimateCyclePhase({
      date: "2026-06-01",
      periodStarts: starts("2026-01-01", [21, 35, 21, 35]),
      today: TODAY,
    });
    expect(result.isIrregular).toBe(false);
  });

  it("still returns exactly one phase", () => {
    const list = phases(starts("2026-01-01", [21, 40, 22, 41]), 30);
    expect(list).toHaveLength(30);
    expect(list[0]).toBe("menstruation");
  });
});

describe("confidence", () => {
  it("is low with fewer than 3 full cycles", () => {
    const result = estimateCyclePhase({
      date: "2026-03-01",
      periodStarts: starts("2026-01-01", [28, 28]),
      today: TODAY,
    });
    expect(result.confidence).toBe("low");
  });

  it("is low when the user does not know the cycle", () => {
    const result = estimateCyclePhase({
      date: "2026-03-30",
      periodStarts: starts("2026-01-01", [28, 28, 28]),
      today: TODAY,
      config: { unknown: true },
    });
    expect(result.confidence).toBe("low");
  });
});

describe("wording", () => {
  it("does not mention fertility, contraception or pregnancy (FR-CYC-03)", () => {
    const text = source.toLowerCase();
    for (const word of [
      "fertil",
      "płodn",
      "contracept",
      "antykoncep",
      "pregnan",
      "ciąż",
    ]) {
      expect(text).not.toContain(word);
    }
  });
});
