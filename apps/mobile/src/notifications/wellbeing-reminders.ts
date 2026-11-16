import type { CalendarDate } from "@parapka/domain";

import { dateOf, momentOf } from "./chore-reminders";
import type { PlannedNotification } from "./planned";

export interface WellbeingReminderInput {
  /** The cycle panel is on and the reminder is turned on (FR-CYC-05). */
  readonly enabled: boolean;
  /** `HH:MM`, `wellbeingTime` of the settings. */
  readonly time: string;
  /** The days that already have a wellbeing entry. */
  readonly entryDates: readonly CalendarDate[];
  readonly fromMs: number;
  readonly toMs: number;
}

/**
 * The daily reminder to note the well-being (FR-NOT-05), from local data only.
 * Nothing when it is off or the day already has an entry. The range starts a
 * day early, because a late reminder may be moved by the quiet hours into the
 * window; `planNotifications` cuts the window. The text names no cycle.
 */
export function planWellbeingReminders({
  enabled,
  time,
  entryDates,
  fromMs,
  toMs,
}: WellbeingReminderInput): PlannedNotification[] {
  if (!enabled) return [];
  const noted = new Set(entryDates);
  const last = dateOf(new Date(toMs));
  const result: PlannedNotification[] = [];
  const start = new Date(fromMs);
  for (let offset = -1; ; offset += 1) {
    const date = dateOf(
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset),
    );
    if (date > last) return result;
    if (noted.has(date)) continue;
    result.push({
      id: `wellbeing:${date}`,
      type: "wellbeing",
      atMs: momentOf(date, time),
      title: { key: "notifications.wellbeing.title" },
      body: { key: "notifications.wellbeing.body" },
    });
  }
}
