import {
  listOccurrences,
  reminderRecipients,
  type CalendarDate,
} from "@parapka/domain";

import type { StoredChore } from "../chores/chore-record";
import type { StoredCompletion } from "../chores/completion-repository";
import type { PlannedNotification } from "./planned";

const pad = (value: number) => String(value).padStart(2, "0");

export const dateOf = (day: Date): CalendarDate =>
  [String(day.getFullYear()), pad(day.getMonth() + 1), pad(day.getDate())].join(
    "-",
  );

const addDays = (day: Date, count: number) =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate() + count);

/** The moment of `HH:MM` on a local day; the local calendar keeps a clock change safe. */
export function momentOf(date: CalendarDate, time: string): number {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute).getTime();
}

/** True when the reminder of the occurrence goes to this person (FR-CHR-05). */
function isForMe(chore: StoredChore, date: CalendarDate): boolean {
  try {
    return reminderRecipients(chore, chore.assignment, date).includes("me");
  } catch {
    // An alternating chore has no person before its start date.
    return false;
  }
}

export interface ChoreReminderInput {
  readonly chores: readonly StoredChore[];
  readonly completions: readonly StoredCompletion[];
  readonly fromMs: number;
  readonly toMs: number;
}

/**
 * Reminders of chores for the person using this phone (FR-NOT-05), from local
 * data only, so they work without a pair and without the network (FR-ONB-06).
 * Private chores and the ones without a pair are included; the checked off
 * occurrences are not. The range starts a day early, because a late reminder
 * may be moved by the quiet hours into the window; `planNotifications` cuts
 * the window.
 */
export function planChoreReminders({
  chores,
  completions,
  fromMs,
  toMs,
}: ChoreReminderInput): PlannedNotification[] {
  const done = new Set(
    completions.map((c) => `${c.choreId}|${c.occurrenceDate}`),
  );
  const from = dateOf(addDays(new Date(fromMs), -1));
  const to = dateOf(new Date(toMs));
  return chores.flatMap((chore) => {
    const { reminder } = chore;
    if (reminder === null) return [];
    return listOccurrences(chore, from, to)
      .filter(
        ({ occurrenceDate }) =>
          !done.has(`${chore.id}|${occurrenceDate}`) &&
          isForMe(chore, occurrenceDate),
      )
      .map(({ occurrenceDate }) => ({
        id: `chore-reminder:${chore.id}:${occurrenceDate}`,
        type: "chore-reminder" as const,
        atMs: momentOf(occurrenceDate, reminder),
        title: {
          key: "notifications.choreReminder.title",
          params: { title: chore.title },
        },
        body: { key: "notifications.choreReminder.body" },
      }));
  });
}
