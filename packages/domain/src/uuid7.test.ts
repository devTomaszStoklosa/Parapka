import { describe, expect, it } from "vitest";
import { createUuid7Generator, isUuid7, type RandomSource } from "./uuid7";

function fakeClock(start: number) {
  const state = { now: start };
  return { state, clock: { nowMs: () => state.now } };
}

function fixedRandom(byte: number): RandomSource {
  return { bytes: (length) => new Uint8Array(length).fill(byte) };
}

function sequenceRandom(): RandomSource {
  let counter = 0;
  return {
    bytes: (length) =>
      Uint8Array.from({ length }, () => (counter++ * 37 + 11) % 256),
  };
}

describe("format, version and variant", () => {
  it("produces lower-case 8-4-4-4-12 UUIDs with version 7 and RFC 9562 variant", () => {
    const { clock } = fakeClock(1_700_000_000_000);
    const next = createUuid7Generator({ clock, random: sequenceRandom() });
    for (let i = 0; i < 200; i++) {
      const id = next();
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(id[14]).toBe("7");
      expect("89ab").toContain(id[19]);
      expect(isUuid7(id)).toBe(true);
    }
  });

  it("sets version and variant even for all-ones and all-zeros randomness", () => {
    for (const byte of [0x00, 0xff]) {
      const { clock } = fakeClock(0);
      const id = createUuid7Generator({ clock, random: fixedRandom(byte) })();
      expect(id[14]).toBe("7");
      expect("89ab").toContain(id[19]);
    }
  });
});

describe("timestamp", () => {
  it("stores the clock in milliseconds in the first 48 bits", () => {
    const { clock } = fakeClock(0x0123456789ab);
    const id = createUuid7Generator({ clock, random: fixedRandom(1) })();
    expect(id.replace(/-/g, "").slice(0, 12)).toBe("0123456789ab");
  });

  it("gives a greater string for a later time", () => {
    const { clock, state } = fakeClock(1_700_000_000_000);
    const next = createUuid7Generator({ clock, random: fixedRandom(0xff) });
    const earlier = next();
    state.now += 1;
    const later = next();
    expect(later > earlier).toBe(true);
  });
});

describe("monotonicity", () => {
  it("is strictly increasing with a constant clock", () => {
    const { clock } = fakeClock(5000);
    const next = createUuid7Generator({ clock, random: sequenceRandom() });
    let previous = next();
    for (let i = 0; i < 1000; i++) {
      const id = next();
      expect(id > previous).toBe(true);
      previous = id;
    }
  });

  it("is strictly increasing when the clock moves back", () => {
    const { clock, state } = fakeClock(5000);
    const next = createUuid7Generator({ clock, random: sequenceRandom() });
    const first = next();
    state.now = 4000;
    const second = next();
    const third = next();
    expect(second > first).toBe(true);
    expect(third > second).toBe(true);
    expect(second.slice(0, 13)).toBe(first.slice(0, 13));
  });

  it("moves to the next millisecond when the random part overflows", () => {
    const { clock } = fakeClock(5000);
    const next = createUuid7Generator({ clock, random: fixedRandom(0xff) });
    const first = next();
    const second = next();
    const third = next();
    expect(second > first).toBe(true);
    expect(third > second).toBe(true);
    expect(second.replace(/-/g, "").slice(0, 12)).toBe(
      (5001).toString(16).padStart(12, "0"),
    );
    expect(isUuid7(second)).toBe(true);
  });

  it("returns to the clock once it passes the last timestamp", () => {
    const { clock, state } = fakeClock(5000);
    const next = createUuid7Generator({ clock, random: sequenceRandom() });
    next();
    state.now = 9000;
    const id = next();
    expect(id.replace(/-/g, "").slice(0, 12)).toBe(
      (9000).toString(16).padStart(12, "0"),
    );
  });
});

describe("isUuid7", () => {
  const valid = "018f3b8e-5c3a-7b2d-8e4f-0123456789ab";

  it("accepts a valid UUIDv7 with every variant digit", () => {
    expect(isUuid7(valid)).toBe(true);
    for (const variant of ["8", "9", "a", "b"]) {
      expect(isUuid7(`018f3b8e-5c3a-7b2d-${variant}e4f-0123456789ab`)).toBe(
        true,
      );
    }
  });

  it("rejects UUIDs of other versions", () => {
    expect(isUuid7("6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(false);
    expect(isUuid7("550e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });

  it("rejects a wrong variant", () => {
    expect(isUuid7("018f3b8e-5c3a-7b2d-4e4f-0123456789ab")).toBe(false);
    expect(isUuid7("018f3b8e-5c3a-7b2d-ce4f-0123456789ab")).toBe(false);
  });

  it("rejects upper case, wrong length, missing hyphens and empty strings", () => {
    expect(isUuid7(valid.toUpperCase())).toBe(false);
    expect(isUuid7(`${valid}0`)).toBe(false);
    expect(isUuid7(valid.slice(1))).toBe(false);
    expect(isUuid7(valid.replace(/-/g, ""))).toBe(false);
    expect(isUuid7(` ${valid}`)).toBe(false);
    expect(isUuid7("")).toBe(false);
  });
});
