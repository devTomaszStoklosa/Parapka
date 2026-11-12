import { describe, expect, it } from "vitest";

import { isItemField, isValidDueDate, isValidField } from "./item-codec";

describe("item codec", () => {
  it("knows the fields", () => {
    expect(isItemField("doneAt")).toBe(true);
    expect(isItemField("title")).toBe(true);
    expect(isItemField("category")).toBe(true);
    expect(isItemField("weight")).toBe(true);
    expect(isItemField("dueDate")).toBe(true);
    expect(isItemField("status")).toBe(true);
    expect(isItemField("carrier")).toBe(false);
  });

  it.each([
    ["title", "Rzecz", true],
    ["title", "", false],
    ["title", 5, false],
    ["category", "health", true],
    ["category", "nope", false],
    ["weight", 3, true],
    ["weight", 4, false],
    ["dueDate", null, true],
    ["dueDate", "2024-02-29", true],
    ["dueDate", "2026-02-29", false],
    ["dueDate", "2026-2-1", false],
    ["dueDate", 20260201, false],
    ["status", "done", true],
    ["status", "gone", false],
    ["doneAt", null, true],
    ["doneAt", 1_800_000_000_000, true],
    ["doneAt", -1, false],
    ["doneAt", 1.5, false],
    ["doneAt", "1", false],
  ] as const)("%s %j is %s", (name, value, expected) => {
    expect(isValidField(name, value)).toBe(expected);
  });

  it("checks a due date alone", () => {
    expect(isValidDueDate("2026-12-31")).toBe(true);
    expect(isValidDueDate("2026-13-01")).toBe(false);
  });
});
