import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { wireChores } from "../chores/wiring";
import { usePlatform, type Platform } from "../platform/context";
import type { NotifierMessage } from "../platform/notifier";
import { planChoreReminders } from "./chore-reminders";
import { listQueued, messageFor, RETENTION_MS, takeDue } from "./delivery";
import { NotificationBanner } from "./NotificationBanner";
import { createNotificationSettingsRepository } from "./notification-settings";
import { planNotifications } from "./planned";

/** How often the open app looks for due notifications. */
export const CHECK_MS = 60_000;

/** One check: what is due now, as the message to show, or null. */
async function dueMessage(platform: Platform): Promise<NotifierMessage | null> {
  const { database, clock } = platform;
  const { chores, completions } = wireChores(platform);
  const settings = await createNotificationSettingsRepository(database).get();
  const toMs = clock.nowMs();
  const fromMs = toMs - RETENTION_MS;
  const planned = planNotifications({
    sources: [
      planChoreReminders({
        chores: await chores.list(),
        completions: await completions.list(),
        fromMs,
        toMs,
      }),
      await listQueued(database),
    ],
    settings,
    fromMs,
    toMs,
  });
  const [first, ...rest] = await takeDue(database, planned, toMs);
  return first ? messageFor([first, ...rest], settings.discreet) : null;
}

/**
 * No UI of its own: while the app is open it looks every minute, and when the
 * tab comes back to the front, for the notifications that are due (FR-NOT-01).
 * The browser notification is used when the browser allows it, otherwise the
 * in-app banner. It is mounted inside the lock gate next to `SyncRunner`: a
 * locked app does not run it and shows nothing, not even the discreet text.
 * What fell due meanwhile waits for the unlock and is then shown once, if it is
 * not older than 24 hours.
 */
export function NotificationRunner() {
  const platform = usePlatform();
  const [banner, setBanner] = useState<NotifierMessage | null>(null);
  useEffect(() => {
    let active = true;
    let running = false;
    const check = () => {
      if (running) return;
      running = true;
      dueMessage(platform)
        .then((message) => {
          if (!active || !message) return;
          if (platform.notifier?.permission() === "granted") {
            platform.notifier.show(message);
          } else {
            setBanner(message);
          }
        })
        // A failed check is repeated by the next one; nothing is delivered twice.
        .catch(() => undefined)
        .finally(() => {
          running = false;
        });
    };
    check();
    const timer = setInterval(check, CHECK_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => {
      active = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, [platform]);
  if (!banner) return null;
  return (
    <NotificationBanner
      title={banner.title}
      body={banner.body}
      onClose={() => {
        setBanner(null);
      }}
    />
  );
}
