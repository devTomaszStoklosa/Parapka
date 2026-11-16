import type { NotificationSettings } from "./notification-settings";
import type { NotificationTypeId } from "./notification-types";
import { shiftOutOfQuietHours } from "./quiet-hours";

/** A text as a translation key with its parameters, never a ready sentence. */
export interface NotificationText {
  readonly key: string;
  readonly params?: Readonly<Record<string, string>>;
}

/** One notification the phone should show, planned from local data only. */
export interface PlannedNotification {
  /** Stable for the occurrence, e.g. `chore-reminder:<choreId>:<date>`. */
  readonly id: string;
  readonly type: NotificationTypeId;
  readonly atMs: number;
  readonly title: NotificationText;
  readonly body: NotificationText;
}

export interface PlanInput {
  readonly sources: readonly (readonly PlannedNotification[])[];
  readonly settings: NotificationSettings;
  readonly fromMs: number;
  readonly toMs: number;
}

/**
 * Joins the sources: drops the turned off types, moves the moments out of the
 * quiet hours (FR-NOT-07), keeps those in `[fromMs, toMs]`, orders them by
 * time and keeps the first notification of every `id`. The texts stay as the
 * source made them; the discreet mode is applied on delivery.
 */
export function planNotifications({
  sources,
  settings,
  fromMs,
  toMs,
}: PlanInput): PlannedNotification[] {
  const seen = new Set<string>();
  return sources
    .flat()
    .filter((item) => settings.enabled[item.type])
    .map((item) => ({
      ...item,
      atMs: shiftOutOfQuietHours(item.atMs, settings.quietHours),
    }))
    .filter((item) => item.atMs >= fromMs && item.atMs <= toMs)
    .sort((a, b) => a.atMs - b.atMs)
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
}
