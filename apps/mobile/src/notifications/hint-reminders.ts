import type { ReceivedHint } from "../cycle/received-hint-repository";
import { momentOf } from "./chore-reminders";
import type { PlannedNotification } from "./planned";

export interface HintReminderInput {
  /** The hint of the partner for today, or null. */
  readonly hint: Pick<ReceivedHint, "forDate" | "status"> | null;
  /** `HH:MM`, `partnerHintTime` of the settings. */
  readonly time: string;
}

/**
 * The hint of the day for the person using this phone (FR-NOT-05), at the time
 * from the settings. Nothing when the partner sent no hint for today or
 * skipped it (a pause, "no hint today"); the text names no cycle, the hint
 * itself stays on the screen of the day.
 */
export function planHintReminders({
  hint,
  time,
}: HintReminderInput): PlannedNotification[] {
  if (hint === null || hint.status === "skipped") return [];
  return [
    {
      id: `partner-hint:${hint.forDate}`,
      type: "partner-hint",
      atMs: momentOf(hint.forDate, time),
      title: { key: "notifications.partnerHint.title" },
      body: { key: "notifications.partnerHint.body" },
    },
  ];
}
