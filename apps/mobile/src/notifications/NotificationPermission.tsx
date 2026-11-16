import { useState } from "react";
import { View } from "react-native";

import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import type { Notifier, NotifierPermission } from "../platform/notifier";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";

const TEXTS = {
  granted: "notifications.settings.permission.granted",
  denied: "notifications.settings.permission.denied",
  unsupported: "notifications.settings.permission.unsupported",
} as const;

/**
 * The consent of the browser. Without a notifier it is the same as an
 * unsupported browser: the app shows the in-app banner only.
 */
export function NotificationPermission({ notifier }: { notifier?: Notifier }) {
  const [permission, setPermission] = useState<NotifierPermission>(
    notifier?.permission() ?? "unsupported",
  );
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText style={{ fontWeight: "bold" }}>
        {t("notifications.settings.permission.title")}
      </AppText>
      {permission === "default" && notifier ? (
        <Button
          primary
          label={t("notifications.settings.permission.enable")}
          onPress={() => {
            // Called straight from the press: the browser wants a user gesture.
            notifier
              .requestPermission()
              .then(setPermission)
              .catch(() => {
                setPermission(notifier.permission());
              });
          }}
        />
      ) : permission === "default" ? null : (
        <AppText>{t(TEXTS[permission])}</AppText>
      )}
      <AppText>{t("notifications.settings.permission.openTabOnly")}</AppText>
    </View>
  );
}
