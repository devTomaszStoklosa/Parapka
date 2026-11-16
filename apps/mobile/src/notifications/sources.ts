import { wireCheckin } from "../checkin/wiring";
import { wireConsent } from "../consent/wiring";
import { wireChores } from "../chores/wiring";
import { wireCycleHints } from "../cycle/wiring";
import type { Platform } from "../platform/context";
import { planCheckinReminders } from "./checkin-reminders";
import { planChoreReminders } from "./chore-reminders";
import { listQueued } from "./delivery";
import { planHintReminders } from "./hint-reminders";
import type { NotificationSettings } from "./notification-settings";
import type { PlannedNotification } from "./planned";

/**
 * Every source of notifications, read from the local data only: the chores,
 * the check-in, the hint of the partner and the queue of the events. The
 * quiet hours and the turned off types are applied by `planNotifications`.
 */
export async function collectSources(
  platform: Platform,
  settings: NotificationSettings,
  range: { fromMs: number; toMs: number },
): Promise<PlannedNotification[][]> {
  const { chores, completions } = wireChores(platform);
  const { checkin } = wireCheckin(platform);
  const { received } = wireCycleHints(platform);
  const { window, paired, status } = await checkin.current();
  const shared = await wireConsent(platform).consent.isShared("CHECKIN");
  return [
    planChoreReminders({
      chores: await chores.list(),
      completions: await completions.list(),
      ...range,
    }),
    planCheckinReminders({ window, paired, shared, status }),
    planHintReminders({
      hint: await received.today(),
      time: settings.partnerHintTime,
    }),
    await listQueued(platform.database),
  ];
}
