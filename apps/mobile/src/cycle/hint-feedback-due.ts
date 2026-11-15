import type { CalendarDate } from "@parapka/domain";

import { addDays } from "./hint-repository";

/** The days between two surveys, and the length of the period they ask about. */
export const FEEDBACK_INTERVAL_DAYS = 14;

/**
 * Whether the survey on the hints is due (FR-CYC-12): the first own hint is
 * at least 14 days old and the last survey, answered or closed, too.
 */
export function isFeedbackDue(input: {
  today: CalendarDate;
  since: CalendarDate | null;
  lastShown: CalendarDate | null;
}): boolean {
  const { today, since, lastShown } = input;
  if (since === null) return false;
  const passed = (date: CalendarDate) =>
    addDays(date, FEEDBACK_INTERVAL_DAYS) <= today;
  return passed(since) && (lastShown === null || passed(lastShown));
}

/** The 14 days that end on `today`, as `from/to`. */
export function feedbackPeriod(today: CalendarDate): string {
  return `${addDays(today, 1 - FEEDBACK_INTERVAL_DAYS)}/${today}`;
}
