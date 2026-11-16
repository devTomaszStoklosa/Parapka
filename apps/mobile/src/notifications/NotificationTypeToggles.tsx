import { Switch, View } from "react-native";

import { t } from "../i18n";
import { AppText } from "../ui/AppText";
import { MIN_TOUCH_TARGET, spacing } from "../ui/theme";
import {
  NOTIFICATION_TYPES,
  type NotificationTypeId,
} from "./notification-types";

/** A labelled switch; the label is the name for assistive technology too. */
export function LabelledSwitch(props: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        minHeight: MIN_TOUCH_TARGET,
      }}
    >
      <Switch
        accessibilityLabel={props.label}
        value={props.value}
        onValueChange={props.onChange}
      />
      <View style={{ flex: 1 }}>
        <AppText>{props.label}</AppText>
        {props.hint ? <AppText>{props.hint}</AppText> : null}
      </View>
    </View>
  );
}

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
