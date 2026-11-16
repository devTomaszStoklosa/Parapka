import { currentCheckinWindow, type CheckinSchedule } from "@parapka/domain";
import { expect, it } from "vitest";

import { pl } from "../i18n/pl";
import {
  chronological,
  rangeText,
  weekNumber,
  windowOfWeek,
  type HistoryEntry,
} from "./checkin-history-model";

const sunday: CheckinSchedule = { weekday: 7, hour: 19, minute: 0 };

it("gives the window of the week at the day and time of the schedule", () => {
  expect(windowOfWeek("2026-W45", sunday)).toEqual({
    week: "2026-W45",
    start: { year: 2026, month: 11, day: 8, hour: 19, minute: 0 },
    end: { year: 2026, month: 11, day: 15, hour: 19, minute: 0 },
  });
});

it.each([
  ["2026-W53", { weekday: 7, hour: 19, minute: 0 }],
  ["2027-W01", { weekday: 1, hour: 0, minute: 5 }],
  ["2025-W01", { weekday: 3, hour: 23, minute: 59 }],
  ["2026-W10", { weekday: 4, hour: 8, minute: 30 }],
] as const)("agrees with the domain for %s", (week, schedule) => {
  const { start } = windowOfWeek(week, schedule);
  expect(currentCheckinWindow(start, schedule)).toEqual(
    windowOfWeek(week, schedule),
  );
});

it("writes the range of the window, also across months", () => {
  expect(rangeText(windowOfWeek("2026-W45", sunday))).toBe("8–15 listopada");
  expect(rangeText(windowOfWeek("2026-W44", sunday))).toBe("1–8 listopada");
  expect(rangeText(windowOfWeek("2026-W43", sunday))).toBe(
    "25 października – 1 listopada",
  );
  expect(rangeText(windowOfWeek("2026-W44", { ...sunday, weekday: 4 }))).toBe(
    "29 października – 5 listopada",
  );
  expect(pl.checkin.history.rangeAcross).toContain("–");
});

it("numbers the weeks and orders them from the oldest", () => {
  expect(weekNumber("2026-W05")).toBe("5");
  const entries = ["2026-W46", "2026-W45"].map((week) => ({ week }));
  expect(
    chronological(entries as HistoryEntry[]).map(({ week }) => week),
  ).toEqual(["2026-W45", "2026-W46"]);
});
