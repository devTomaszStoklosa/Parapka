import { forecastCycle } from "@parapka/domain";
import { describe, expect, it } from "vitest";

import { calendarMonth } from "./calendar-model";

const periods = [{ id: "seed", startDate: "2026-11-01", endDate: null }];
const forecast = forecastCycle({
  periodStarts: ["2026-11-01"],
  today: "2026-11-14",
  config: { unknown: true },
});
const november = () =>
  calendarMonth({
    year: 2026,
    month: 11,
    periods,
    periodLength: 5,
    forecast,
    today: "2026-11-14",
  });
const days = (pick: (day: ReturnType<typeof november>[number]) => boolean) =>
  november()
    .filter(pick)
    .map((d) => Number(d.date.slice(8)));

describe("calendarMonth for November 2026", () => {
  it("has 30 days in order", () => {
    expect(november().map((d) => d.date)).toHaveLength(30);
    expect(november()[0]?.date).toBe("2026-11-01");
    expect(november()[29]?.date).toBe("2026-11-30");
  });

  it("marks the saved period, the forecast range, the next start and today", () => {
    expect(days((d) => d.isPeriod)).toEqual([1, 2, 3, 4, 5]);
    expect(days((d) => d.inForecastRange)).toEqual([27, 28, 29, 30]);
    expect(days((d) => d.isNextStart)).toEqual([29]);
    expect(days((d) => d.isToday)).toEqual([14]);
  });

  it("has no fertility or ovulation fields", () => {
    for (const day of november()) {
      expect(Object.keys(day).sort()).toEqual([
        "date",
        "inForecastRange",
        "isNextStart",
        "isPeriod",
        "isToday",
      ]);
    }
  });

  it("shows the range that continues into December", () => {
    const december = calendarMonth({
      year: 2026,
      month: 12,
      periods,
      periodLength: 5,
      forecast,
      today: "2026-11-14",
    });
    expect(december).toHaveLength(31);
    expect(december[0]?.inForecastRange).toBe(true);
    expect(december[1]?.inForecastRange).toBe(false);
  });

  it("marks only the saved days without a forecast", () => {
    const month = calendarMonth({
      year: 2026,
      month: 11,
      periods,
      periodLength: 2,
      forecast: null,
      today: "2026-10-01",
    });
    expect(month.filter((d) => d.isPeriod)).toHaveLength(2);
    expect(month.some((d) => d.inForecastRange || d.isNextStart)).toBe(false);
  });
});
