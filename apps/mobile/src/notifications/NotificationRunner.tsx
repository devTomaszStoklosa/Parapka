import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { usePlatform, type Platform } from "../platform/context";
import type { NotifierMessage } from "../platform/notifier";
import { markDelivered, messageFor, RETENTION_MS, takeDue } from "./delivery";
import { NotificationBanner } from "./NotificationBanner";
import { createNotificationSettingsRepository } from "./notification-settings";
import { planNotifications } from "./planned";
import { collectSources } from "./sources";

/** How often the open app looks for due notifications. */
export const CHECK_MS = 60_000;

interface Due {
  /** Remember these as delivered, once the message is really going to be shown. */
  remember: () => Promise<void>;
  /** The message to show, or null when everything due is skipped. */
  message: NotifierMessage | null;
}

/** One check: what is due now. Nothing is remembered before `remember` is called. */
async function checkDue(platform: Platform): Promise<Due | null> {
  const { database, clock } = platform;
  const settings = await createNotificationSettingsRepository(database).get();
  const toMs = clock.nowMs();
  const fromMs = toMs - RETENTION_MS;
  const planned = planNotifications({
    sources: await collectSources(platform, settings, { fromMs, toMs }),
    settings,
    fromMs,
    toMs,
  });
  const { due, show } = await takeDue(database, planned, toMs);
  if (due.length === 0) return null;
  const [first, ...rest] = show;
  return {
    remember: () => markDelivered(database, due),
    message: first ? messageFor([first, ...rest], settings.discreet) : null,
  };
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
      checkDue(platform)
        .then(async (result) => {
          // Unmounted meanwhile: nothing is remembered, the next mount delivers.
          if (!active || !result) return;
          await result.remember();
          const { message } = result;
          if (!message) return;
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
