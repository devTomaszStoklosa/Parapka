import type { CheckinWindow } from "@parapka/domain";

import type { CheckinStatus } from "../checkin/checkin-service";
import type { PlannedNotification } from "./planned";

export interface CheckinReminderInput {
  readonly window: CheckinWindow;
  readonly paired: boolean;
  /** The state of the own check-in; the partner's part of it is not read. */
  readonly status: CheckinStatus;
}

const text = {
  title: { key: "notifications.checkin.title" },
  body: { key: "notifications.checkin.body" },
} as const;

/**
 * The reminders of the check-in of the current window (FR-CHK-07): one when
 * the window opens and one 24 hours later, only while the own check-in is not
 * filled in. Only `status === "open"` counts as not filled in; whether the
 * partner has filled in theirs changes neither the text nor the time. Without
 * a pair there is no check-in and no reminder. The 24 hours are counted in the
 * local calendar, so a clock change keeps the time of the day.
 */
export function planCheckinReminders({
  window,
  paired,
  status,
}: CheckinReminderInput): PlannedNotification[] {
  if (!paired || status !== "open") return [];
  const { year, month, day, hour, minute } = window.start;
  const at = (days: number) =>
    new Date(year, month - 1, day + days, hour, minute).getTime();
  return [
    { id: `checkin:${window.week}:first`, offset: 0 },
    { id: `checkin:${window.week}:repeat`, offset: 1 },
  ].map(({ id, offset }) => ({
    id,
    type: "checkin" as const,
    atMs: at(offset),
    ...text,
  }));
}
