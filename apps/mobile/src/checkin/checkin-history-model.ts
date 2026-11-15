import type {
  CheckinAnswers,
  CheckinSchedule,
  CheckinWindow,
  IsoWeek,
  LocalDateTime,
} from "@parapka/domain";

import { dateText } from "../cycle/cycle-text";
import { t } from "../i18n";

/** One week of the history; `partner` is null unless the week was revealed. */
export interface HistoryEntry {
  week: IsoWeek;
  window: CheckinWindow;
  own: CheckinAnswers;
  partner: CheckinAnswers | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const localOf = (ms: number): LocalDateTime => {
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
};

/**
 * The window that opens in the ISO week at the day and time of the schedule
 * and ends 7 days later, as `currentCheckinWindow` gives it for that week.
 */
export function windowOfWeek(
  week: IsoWeek,
  { weekday, hour, minute }: CheckinSchedule,
): CheckinWindow {
  const year = Number(week.slice(0, 4));
  const number = Number(week.slice(6));
  // The 4th of January is always in week 1.
  const fourth = new Date(Date.UTC(year, 0, 4));
  const monday = Date.UTC(year, 0, 4 - ((fourth.getUTCDay() + 6) % 7));
  const day = monday + ((number - 1) * 7 + weekday - 1) * DAY_MS;
  const start = day + (hour * 60 + minute) * 60 * 1000;
  return { week, start: localOf(start), end: localOf(start + 7 * DAY_MS) };
}

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

const dateOf = ({ year, month, day }: LocalDateTime) =>
  `${pad(year, 4)}-${pad(month)}-${pad(day)}`;

/** "8–15 listopada", or "29 października – 5 listopada" across months. */
export function rangeText({ start, end }: CheckinWindow): string {
  const to = dateText(dateOf(end));
  if (start.month === end.month) {
    return t("checkin.history.range", { from: start.day, to });
  }
  return t("checkin.history.rangeAcross", {
    from: dateText(dateOf(start)),
    to,
  });
}

/** The number of the week from `YYYY-Www`, without the leading zero. */
export const weekNumber = (week: IsoWeek) => String(Number(week.slice(6)));

/** The weeks of the trend, the oldest first. */
export const chronological = (entries: readonly HistoryEntry[]) =>
  [...entries].reverse();
