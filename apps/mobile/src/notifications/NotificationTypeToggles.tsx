import { View } from "react-native";

import { t } from "../i18n";
import { LabelledSwitch } from "../ui/LabelledSwitch";
import { spacing } from "../ui/theme";
import {
  NOTIFICATION_TYPES,
  type NotificationTypeId,
} from "./notification-types";

/** One switch per type; the wellbeing needs the cycle panel, the hint a pair. */
export function NotificationTypeToggles(props: {
  enabled: Readonly<Record<NotificationTypeId, boolean>>;
  cyclePanel: boolean;
  paired: boolean;
  onChange: (id: NotificationTypeId, value: boolean) => void;
}) {
  const { enabled, cyclePanel, paired, onChange } = props;
  const shown = NOTIFICATION_TYPES.filter(
    ({ id }) =>
      (id !== "wellbeing" || cyclePanel) && (id !== "partner-hint" || paired),
  );
  return (
    <View
      role="group"
      accessibilityLabel={t("notifications.settings.types.group")}
      style={{ gap: spacing.sm }}
    >
      {shown.map(({ id }) => (
        <LabelledSwitch
          key={id}
          label={t(`notifications.settings.types.${id}`)}
          value={enabled[id]}
          onChange={(value) => {
            onChange(id, value);
          }}
        />
      ))}
    </View>
  );
}
