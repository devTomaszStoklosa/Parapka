import { describe, expect, it } from "vitest";

import {
  periodDays,
  PeriodValidationError,
  validatePeriod,
  type PeriodLog,
} from "./period-validation";

const today = "2026-11-14";
const entry = (
  startDate: string,
  endDate: string | null,
  id = "new",
): PeriodLog => ({ id, startDate, endDate });
const existing = [entry("2026-10-01", "2026-10-05", "old")];

describe("validatePeriod", () => {
  it.each([
    entry("2026-11-14", null),
    entry("2026-11-01", "2026-11-05"),
    entry("2026-11-01", "2026-11-11"),
    entry("2026-11-01", "2026-11-01"),
  ])("accepts %j", (period) => {
    expect(() => {
      validatePeriod(period, existing, today);
    }).not.toThrow();
  });

  it.each([
    ["later than today", entry("2026-11-15", null)],
    ["before it starts", entry("2026-11-05", "2026-11-04")],
    ["more than 10 days", entry("2026-11-01", "2026-11-12")],
    ["overlaps the end", entry("2026-10-05", "2026-10-07")],
    ["overlaps the start", entry("2026-09-28", "2026-10-01")],
    ["overlaps from inside", entry("2026-10-03", null)],
    ["has an invalid start", entry("2026-13-01", null)],
    ["has an invalid end", entry("2026-11-01", "soon")],
  ])("rejects a period that %s", (_reason, period) => {
    expect(() => {
      validatePeriod(period, existing, today);
    }).toThrow(PeriodValidationError);
  });

  it("does not overlap the entry with itself", () => {
    expect(() => {
      validatePeriod(entry("2026-10-02", "2026-10-06", "old"), existing, today);
    }).not.toThrow();
  });
});

describe("periodDays", () => {
  it("lists the days of closed and ongoing entries", () => {
    expect(
      periodDays(
        [entry("2026-10-30", "2026-11-01"), entry("2026-11-10", null)],
        2,
      ),
    ).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-10",
      "2026-11-11",
    ]);
  });
});
