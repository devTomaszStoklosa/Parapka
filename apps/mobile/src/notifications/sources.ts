import { wireCheckin } from "../checkin/wiring";
import { wireConsent } from "../consent/wiring";
import { wireChores } from "../chores/wiring";
import { wireCycleHints } from "../cycle/wiring";
import { createWellbeingRepository } from "../cycle/wellbeing-repository";
import { createCycleSettingsRepository } from "../data/cycle-settings";
import { createProfileRepository } from "../data/profile-repository";
import type { Platform } from "../platform/context";
import { planCheckinReminders } from "./checkin-reminders";
import { dateOf, planChoreReminders } from "./chore-reminders";
import { listQueued } from "./delivery";
import { planHintReminders } from "./hint-reminders";
import type { NotificationSettings } from "./notification-settings";
import type { PlannedNotification } from "./planned";
import { planWellbeingReminders } from "./wellbeing-reminders";

/**
 * Every source of notifications, read from the local data only: the chores,
 * the check-in, the hint of the partner, the wellbeing reminder and the queue of the events. The
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
  const { database } = platform;
  const enabled =
    (await createProfileRepository(database).get())?.cycle === "yes" &&
    (await createCycleSettingsRepository(database).get())
      ?.wellbeingReminder === true;
  const entries = await createWellbeingRepository(database).range(
    dateOf(new Date(range.fromMs - 48 * 3_600_000)),
    dateOf(new Date(range.toMs)),
  );
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
    planWellbeingReminders({
      enabled,
      time: settings.wellbeingTime,
      entryDates: entries.map(({ date }) => date),
      ...range,
    }),
    await listQueued(platform.database),
  ];
}
