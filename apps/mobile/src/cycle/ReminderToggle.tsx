import { View } from "react-native";

import { t } from "../i18n";
import { usePlatform } from "../platform/context";
import { AlertText } from "../ui/AlertText";
import { LabelledSwitch } from "../ui/LabelledSwitch";
import { spacing } from "../ui/theme";
import { useCycleActions } from "./use-cycle-actions";

/** The switch of the reminder about the wellbeing entry; off by default. */
export function ReminderToggle({ enabled }: { enabled: boolean }) {
  const actions = useCycleActions(usePlatform());
  return (
    <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
      <LabelledSwitch
        label={t("cycle.reminder.label")}
        hint={t("cycle.reminder.hint")}
        value={enabled}
        onChange={(value) => {
          void actions.setReminder(value);
        }}
      />
      {actions.error ? <AlertText>{actions.error}</AlertText> : null}
    </View>
  );
}
