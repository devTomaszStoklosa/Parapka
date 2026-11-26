import type { ReactNode } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";

import { t } from "../i18n";
import { AppText } from "../ui/AppText";
import { Icon, type IconName } from "../ui/Icon";
import { colors, MIN_TOUCH_TARGET, radii, spacing } from "../ui/theme";

export function Button(props: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  expanded?: boolean;
  icon?: IconName;
}) {
  const { label, onPress, primary, disabled, expanded, icon } = props;
  const ink = primary ? colors.surface : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      aria-expanded={expanded}
      accessibilityState={{
        disabled: disabled === true,
        ...(expanded === undefined ? {} : { expanded }),
      }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 48,
        minWidth: MIN_TOUCH_TARGET,
        paddingHorizontal: spacing.lg,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "row",
        gap: spacing.sm,
        borderRadius: radii.pill,
        borderWidth: 1.5,
        borderColor: colors.text,
        backgroundColor: primary ? colors.text : "transparent",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon ? <Icon name={icon} size={18} color={ink} /> : null}
      <AppText style={{ color: ink }}>{label}</AppText>
    </Pressable>
  );
}

/** A choice: a radio button, or a checkbox when `multiple`. */
export function Option(props: {
  label: string;
  selected: boolean;
  onPress: () => void;
  multiple?: boolean;
}) {
  const { label, selected, onPress, multiple } = props;
  return (
    <Pressable
      role={multiple ? "checkbox" : "radio"}
      aria-checked={selected}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: MIN_TOUCH_TARGET,
        justifyContent: "center",
        paddingHorizontal: spacing.md,
        borderRadius: radii.field,
        borderWidth: 1,
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: selected ? colors.surface : colors.background,
      }}
    >
      <AppText>{(selected ? "● " : "○ ") + label}</AppText>
    </Pressable>
  );
}

export function Field(props: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  numeric?: boolean;
}) {
  const { label, value, onChange, numeric } = props;
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText>{label}</AppText>
      <TextInput
        accessibilityLabel={label}
        value={value}
        keyboardType={numeric ? "number-pad" : "default"}
        onChangeText={onChange}
        style={{
          minHeight: MIN_TOUCH_TARGET,
          borderRadius: radii.field,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: spacing.sm,
          color: colors.text,
        }}
      />
    </View>
  );
}

/** A step: the title, the content, and the buttons back and forward. */
export function StepFrame(props: {
  title: string;
  hint?: string;
  position: string;
  onBack: () => void;
  nextLabel: string;
  canContinue: boolean;
  onNext: () => void;
  children?: ReactNode;
}) {
  const { title, hint, position, onBack, nextLabel, canContinue, onNext } =
    props;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
    >
      <AppText>{position}</AppText>
      <AppText variant="title" accessibilityRole="header">
        {title}
      </AppText>
      {hint ? <AppText>{hint}</AppText> : null}
      {props.children}
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <Button label={t("onboarding.back")} onPress={onBack} />
        <Button
          primary
          label={nextLabel}
          disabled={!canContinue}
          onPress={onNext}
        />
      </View>
    </ScrollView>
  );
}
