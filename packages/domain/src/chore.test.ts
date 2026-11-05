import { describe, expect, it } from "vitest";
import {
  ChoreValidationError,
  listOccurrences,
  validateChoreTitle,
  type Chore,
  type ChoreRule,
} from "./chore.js";

const make = (rule: ChoreRule): Chore => ({ id: "c1", title: "Chore", rule });
const dates = (rule: ChoreRule, from: string, to: string) =>
  listOccurrences(make(rule), from, to).map((o) => o.occurrenceDate);

describe("title", () => {
  it("accepts 1 and 80 characters", () => {
    expect(() => {
      validateChoreTitle("a");
    }).not.toThrow();
    expect(() => {
      validateChoreTitle("a".repeat(80));
    }).not.toThrow();
  });

  it("rejects empty and 81 characters", () => {
    expect(() => {
      validateChoreTitle("");
    }).toThrow(ChoreValidationError);
    expect(() => {
      validateChoreTitle("a".repeat(81));
    }).toThrow(ChoreValidationError);
  });

  it("is checked when listing", () => {
    const chore: Chore = { id: "c", title: "", rule: { kind: "daily" } };
    expect(() => listOccurrences(chore, "2025-01-01", "2025-01-02")).toThrow(
      ChoreValidationError,
    );
  });
});

describe("rules", () => {
  it("daily crosses the year end", () => {
    expect(dates({ kind: "daily" }, "2025-12-30", "2026-01-02")).toEqual([
      "2025-12-30",
      "2025-12-31",
      "2026-01-01",
      "2026-01-02",
    ]);
  });

  it("every N days counts from the start date", () => {
    const rule: ChoreRule = {
      kind: "everyNDays",
      interval: 3,
      startDate: "2025-02-27",
    };
    expect(dates(rule, "2025-02-25", "2025-03-10")).toEqual([
      "2025-02-27",
      "2025-03-02",
      "2025-03-05",
      "2025-03-08",
    ]);
    expect(dates(rule, "2025-03-01", "2025-03-06")).toEqual([
      "2025-03-02",
      "2025-03-05",
    ]);
  });

  it("every N days crosses a leap day", () => {
    const rule: ChoreRule = {
      kind: "everyNDays",
      interval: 2,
      startDate: "2024-02-26",
    };
    expect(dates(rule, "2024-02-26", "2024-03-02")).toEqual([
      "2024-02-26",
      "2024-02-28",
      "2024-03-01",
    ]);
  });

  it("Monday and Thursday give two occurrences a week", () => {
    const rule: ChoreRule = { kind: "weekdays", weekdays: [1, 4] };
    expect(dates(rule, "2025-06-02", "2025-06-08")).toEqual([
      "2025-06-02",
      "2025-06-05",
    ]);
  });

  it("monthly uses the last day when the month is short", () => {
    const rule: ChoreRule = { kind: "monthly", dayOfMonth: 31 };
    expect(dates(rule, "2025-01-01", "2025-04-30")).toEqual([
      "2025-01-31",
      "2025-02-28",
      "2025-03-31",
      "2025-04-30",
    ]);
  });

  it("monthly handles February in leap and common years", () => {
    for (const dayOfMonth of [29, 30, 31]) {
      const rule: ChoreRule = { kind: "monthly", dayOfMonth };
      expect(dates(rule, "2024-02-01", "2024-02-29")).toEqual(["2024-02-29"]);
      expect(dates(rule, "2028-02-01", "2028-02-29")).toEqual(["2028-02-29"]);
      expect(dates(rule, "2027-02-01", "2027-02-28")).toEqual(["2027-02-28"]);
    }
  });

  it("monthly crosses the year end and respects range bounds", () => {
    const rule: ChoreRule = { kind: "monthly", dayOfMonth: 15 };
    expect(dates(rule, "2025-12-16", "2026-02-14")).toEqual(["2026-01-15"]);
  });

  it("occasional with a due date gives one occurrence", () => {
    const rule: ChoreRule = { kind: "occasional", dueDate: "2025-05-10" };
    expect(dates(rule, "2025-05-01", "2025-05-31")).toEqual(["2025-05-10"]);
    expect(dates(rule, "2025-06-01", "2025-06-30")).toEqual([]);
  });

  it("occasional without a due date gives none", () => {
    expect(dates({ kind: "occasional" }, "2025-05-01", "2025-05-31")).toEqual(
      [],
    );
  });
});

describe("occurrences", () => {
  it("are identified by choreId and a unique date", () => {
    const list = listOccurrences(
      make({ kind: "daily" }),
      "2025-02-25",
      "2025-03-03",
    );
    const keys = list.map((o) => o.choreId + "|" + o.occurrenceDate);
    expect(new Set(keys).size).toBe(list.length);
    expect(list.every((o) => o.choreId === "c1")).toBe(true);
  });
});

describe("validation", () => {
  const range = ["2025-01-01", "2025-01-02"] as const;

  it("rejects bad rules", () => {
    const bad: ChoreRule[] = [
      { kind: "everyNDays", interval: 0, startDate: "2025-01-01" },
      { kind: "weekdays", weekdays: [] },
      { kind: "monthly", dayOfMonth: 32 },
    ];
    for (const rule of bad) {
      expect(() => dates(rule, ...range)).toThrow(ChoreValidationError);
    }
  });

  it("rejects a reversed range and a malformed date", () => {
    expect(() => dates({ kind: "daily" }, "2025-01-02", "2025-01-01")).toThrow(
      ChoreValidationError,
    );
    expect(() => dates({ kind: "daily" }, "2025-1-1", "2025-01-02")).toThrow();
  });
});
