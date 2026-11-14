import { describe, expect, it } from "vitest";

import {
  validateWellbeing,
  WellbeingValidationError,
  type WellbeingEntry,
} from "./wellbeing-validation";

const valid: WellbeingEntry = {
  date: "2026-11-14",
  energy: 1,
  mood: 5,
  tension: 3,
  tags: ["headache", "sleep"],
};

const invalid = (patch: Record<string, unknown>) => () =>
  validateWellbeing({ ...valid, ...patch });

describe("validateWellbeing", () => {
  it("accepts an entry without desire and note", () => {
    expect(validateWellbeing(valid)).toEqual(valid);
  });

  it("keeps desire and trims the note, an empty one is dropped", () => {
    expect(validateWellbeing({ ...valid, desire: 2, note: " hi " })).toEqual({
      ...valid,
      desire: 2,
      note: "hi",
    });
    expect(validateWellbeing({ ...valid, note: "   " })).toEqual(valid);
  });

  it.each(["energy", "mood", "tension", "desire"])(
    "rejects %s out of 1-5 or not an integer",
    (field) => {
      for (const value of [0, 6, 2.5, Number.NaN]) {
        expect(invalid({ [field]: value })).toThrow(WellbeingValidationError);
      }
    },
  );

  it("rejects unknown and repeated tags", () => {
    expect(invalid({ tags: ["unknown"] })).toThrow("unknown tag");
    expect(invalid({ tags: ["sleep", "sleep"] })).toThrow("duplicated tag");
  });

  it("accepts a note of 280 characters after trimming and rejects longer", () => {
    expect(invalid({ note: ` ${"a".repeat(280)} ` })).not.toThrow();
    expect(invalid({ note: "a".repeat(281) })).toThrow(
      WellbeingValidationError,
    );
  });

  it("rejects an invalid date", () => {
    expect(invalid({ date: "2026-13-40" })).toThrow("invalid date");
  });
});
