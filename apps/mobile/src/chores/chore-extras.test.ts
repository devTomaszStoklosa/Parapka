import { describe, expect, it } from "vitest";

import {
  isValidNote,
  isValidReminder,
  normalizeReminder,
  validateExtras,
} from "./chore-extras";

describe("the note", () => {
  it("is null or a text of 1 to 500 characters", () => {
    expect(isValidNote(null)).toBe(true);
    expect(isValidNote("x".repeat(500))).toBe(true);
    expect(isValidNote("x".repeat(501))).toBe(false);
    expect(isValidNote("")).toBe(false);
    expect(isValidNote("   ")).toBe(false);
    expect(isValidNote(5)).toBe(false);
  });
});

describe("the reminder", () => {
  it("is null or a time from 00:00 to 23:59", () => {
    for (const ok of [null, "00:00", "23:59", "08:30"]) {
      expect(isValidReminder(ok)).toBe(true);
    }
    for (const bad of ["24:00", "8:30", "12:60", "rano", "", 830]) {
      expect(isValidReminder(bad)).toBe(false);
    }
  });

  it("is none for an empty text", () => {
    expect(normalizeReminder("  ")).toBeNull();
    expect(normalizeReminder(" 08:30 ")).toBe("08:30");
  });
});

describe("validating a chore", () => {
  it("accepts missing values and throws for invalid ones", () => {
    expect(() => {
      validateExtras({});
    }).not.toThrow();
    expect(() => {
      validateExtras({ note: "x".repeat(501) });
    }).toThrow("note");
    expect(() => {
      validateExtras({ reminder: "25:00" });
    }).toThrow("reminder");
  });
});
