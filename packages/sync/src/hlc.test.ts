import type { Clock } from "@parapka/domain";
import { describe, expect, it } from "vitest";
import {
  type Hlc,
  HybridLogicalClock,
  MAX_COUNTER,
  MAX_PHYSICAL,
  compareHlc,
  createHlc,
  formatHlc,
  parseHlc,
} from "./index.js";

class FakeClock implements Clock {
  constructor(private readonly readings: number[]) {}
  nowMs(): number {
    const next =
      this.readings.length > 1 ? this.readings.shift() : this.readings[0];
    if (next === undefined) throw new Error("no reading");
    return next;
  }
}

function strictlyIncreasing(stamps: Hlc[]): boolean {
  return stamps.every(
    (s, i) => i === 0 || compareHlc(stamps[i - 1] as Hlc, s) < 0,
  );
}

describe("local event", () => {
  it("increases while the physical clock stands still", () => {
    const hlc = new HybridLogicalClock(new FakeClock([1000]), "a");
    const stamps = [hlc.now(), hlc.now(), hlc.now()];
    expect(strictlyIncreasing(stamps)).toBe(true);
    expect(stamps.map((s) => s.counter)).toEqual([0, 1, 2]);
  });

  it("increases while the physical clock goes forward and resets the counter", () => {
    const hlc = new HybridLogicalClock(new FakeClock([1000, 1000, 1001]), "a");
    const stamps = [hlc.now(), hlc.now(), hlc.now()];
    expect(strictlyIncreasing(stamps)).toBe(true);
    expect(stamps[2]).toEqual({ physical: 1001, counter: 0, deviceId: "a" });
  });

  it("increases while the physical clock goes back", () => {
    const hlc = new HybridLogicalClock(
      new FakeClock([5000, 4000, 3000, 6000, 1]),
      "a",
    );
    const stamps = [hlc.now(), hlc.now(), hlc.now(), hlc.now(), hlc.now()];
    expect(strictlyIncreasing(stamps)).toBe(true);
    expect(stamps[1]?.physical).toBe(5000);
  });

  it("increases for any sequence of readings", () => {
    let seed = 12345;
    const readings = Array.from({ length: 200 }, () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % 20;
    });
    const hlc = new HybridLogicalClock(new FakeClock(readings), "a");
    expect(strictlyIncreasing(readings.map(() => hlc.now()))).toBe(true);
  });
});

describe("receive", () => {
  it("is greater than both when the partner clock is ahead", () => {
    const hlc = new HybridLogicalClock(new FakeClock([1000]), "a");
    const own = hlc.now();
    const remote = createHlc(9000, 3, "b");
    const next = hlc.receive(remote);
    expect(compareHlc(next, remote)).toBe(1);
    expect(compareHlc(next, own)).toBe(1);
    expect(strictlyIncreasing([remote, next, hlc.now()])).toBe(true);
  });

  it("is greater than both when the partner clock is behind", () => {
    const hlc = new HybridLogicalClock(new FakeClock([5000]), "a");
    const own = hlc.now();
    const remote = createHlc(1000, 9, "b");
    const next = hlc.receive(remote);
    expect(compareHlc(next, remote)).toBe(1);
    expect(compareHlc(next, own)).toBe(1);
  });

  it("is greater than both when physical times are equal", () => {
    const hlc = new HybridLogicalClock(new FakeClock([1000]), "a");
    hlc.now();
    const own = hlc.now();
    const remote = createHlc(1000, 7, "b");
    const next = hlc.receive(remote);
    expect(next.counter).toBe(8);
    expect(compareHlc(next, remote)).toBe(1);
    expect(compareHlc(next, own)).toBe(1);
  });

  it("is greater than a remote that is smaller only by deviceId", () => {
    const hlc = new HybridLogicalClock(new FakeClock([1000]), "z");
    const own = hlc.now();
    const remote = createHlc(1000, 0, "a");
    expect(compareHlc(own, remote)).toBe(1);
    expect(compareHlc(hlc.receive(remote), own)).toBe(1);
  });

  it("uses the physical clock when it is ahead of both", () => {
    const hlc = new HybridLogicalClock(new FakeClock([1000, 9000]), "a");
    hlc.now();
    const next = hlc.receive(createHlc(2000, 4, "b"));
    expect(next).toEqual({ physical: 9000, counter: 0, deviceId: "a" });
  });

  it("throws when the counter would overflow", () => {
    const hlc = new HybridLogicalClock(new FakeClock([1000]), "a");
    expect(() => hlc.receive(createHlc(1000, MAX_COUNTER, "b"))).toThrow(
      RangeError,
    );
  });
});

describe("order", () => {
  const base = createHlc(100, 5, "m");

  it("compares physical time first", () => {
    expect(compareHlc(createHlc(99, 9, "z"), base)).toBe(-1);
    expect(compareHlc(createHlc(101, 0, "a"), base)).toBe(1);
  });

  it("compares the counter second", () => {
    expect(compareHlc(createHlc(100, 4, "z"), base)).toBe(-1);
    expect(compareHlc(createHlc(100, 6, "a"), base)).toBe(1);
  });

  it("breaks a tie with the deviceId", () => {
    expect(compareHlc(createHlc(100, 5, "a"), base)).toBe(-1);
    expect(compareHlc(createHlc(100, 5, "n"), base)).toBe(1);
  });

  it("is equal only when all three fields are equal", () => {
    expect(compareHlc(createHlc(100, 5, "m"), base)).toBe(0);
    expect(compareHlc(createHlc(100, 5, "M"), base)).not.toBe(0);
  });
});

describe("text form", () => {
  const samples = [
    createHlc(0, 0, "a"),
    createHlc(1, 0, "a"),
    createHlc(9, 99_999, "a"),
    createHlc(10, 0, "a"),
    createHlc(10, 0, "b"),
    createHlc(10, 1, "A"),
    createHlc(1_700_000_000_000, 0, "3f2b8c1e-aaaa-bbbb-cccc-000000000001"),
    createHlc(1_700_000_000_000, 0, "3f2b8c1e-aaaa-bbbb-cccc-000000000002"),
    createHlc(1_700_000_000_000, 12, "x-y-z"),
    createHlc(MAX_PHYSICAL, MAX_COUNTER, "zz"),
  ];

  it("round-trips", () => {
    for (const sample of samples) {
      expect(parseHlc(formatHlc(sample))).toEqual(sample);
    }
  });

  it("keeps a deviceId with dashes", () => {
    const id = "3f2b8c1e-aaaa-bbbb-cccc-000000000001";
    expect(parseHlc(formatHlc(createHlc(5, 6, id))).deviceId).toBe(id);
  });

  it("orders texts like timestamps", () => {
    for (const a of samples) {
      for (const b of samples) {
        const ta = formatHlc(a);
        const tb = formatHlc(b);
        const textOrder = ta < tb ? -1 : ta > tb ? 1 : 0;
        expect(textOrder).toBe(compareHlc(a, b));
      }
    }
  });
});

describe("errors", () => {
  it.each([
    "",
    "garbage",
    "1-2-a",
    "00000000000000a-00000-a",
    "000000000000001-00000",
    "000000000000001-00000-",
    "000000000000001_00000_a",
    "-00000000000001-00000-a",
  ])("rejects the text %j", (text) => {
    expect(() => parseHlc(text)).toThrow();
  });

  it("rejects an empty deviceId", () => {
    expect(() => createHlc(1, 0, "")).toThrow(TypeError);
    expect(() => new HybridLogicalClock(new FakeClock([1]), "")).toThrow(
      TypeError,
    );
  });

  it("rejects fields out of range", () => {
    expect(() => createHlc(-1, 0, "a")).toThrow(RangeError);
    expect(() => createHlc(1.5, 0, "a")).toThrow(RangeError);
    expect(() => createHlc(MAX_PHYSICAL + 1, 0, "a")).toThrow(RangeError);
    expect(() => createHlc(1, -1, "a")).toThrow(RangeError);
    expect(() => createHlc(1, MAX_COUNTER + 1, "a")).toThrow(RangeError);
  });

  it("throws instead of wrapping the counter on a local event", () => {
    const hlc = new HybridLogicalClock(new FakeClock([1000]), "a");
    for (let i = 0; i <= MAX_COUNTER; i++) hlc.now();
    expect(() => hlc.now()).toThrow(RangeError);
  });

  it("rejects an invalid reading of the physical clock", () => {
    const hlc = new HybridLogicalClock(new FakeClock([Number.NaN]), "a");
    expect(() => hlc.now()).toThrow(RangeError);
  });
});
