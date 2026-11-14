import { Switch, View } from "react-native";

import { t } from "../i18n";
import { usePlatform } from "../platform/context";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";
import { useCycleActions } from "./use-cycle-actions";

/** The switch of the reminder about the wellbeing entry; off by default. */
export function ReminderToggle({ enabled }: { enabled: boolean }) {
  const actions = useCycleActions(usePlatform());
  return (
    <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
      >
        <Switch
          accessibilityLabel={t("cycle.reminder.label")}
          value={enabled}
          onValueChange={(value) => {
            void actions.setReminder(value);
          }}
        />
        <View style={{ flex: 1 }}>
          <AppText>{t("cycle.reminder.label")}</AppText>
          <AppText>{t("cycle.reminder.hint")}</AppText>
        </View>
      </View>
      {actions.error ? (
        <AppText accessibilityRole="alert">{actions.error}</AppText>
      ) : null}
    </View>
  );
}
