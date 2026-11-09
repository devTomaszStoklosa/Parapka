import { useState } from "react";
import { Pressable, View } from "react-native";

import { t } from "../i18n";
import { AppText } from "../ui/AppText";
import { colors, MIN_TOUCH_TARGET, spacing } from "../ui/theme";

function ActionButton({
  label,
  primary,
  onPress,
}: {
  label: string;
  primary?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        minHeight: MIN_TOUCH_TARGET,
        minWidth: MIN_TOUCH_TARGET,
        paddingHorizontal: spacing.md,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: primary ? colors.accent : colors.surface,
      }}
    >
      <AppText style={{ color: primary ? colors.onAccent : colors.text }}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** Reset after a forgotten PIN: two confirmations, then `onReset` (FR-SEC-06). */
export function ResetScreen({
  onReset,
  onCancel,
  onDone,
}: {
  onReset: () => Promise<void>;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = async () => {
    setBusy(true);
    await onReset();
    onDone();
  };

  return (
    <View style={{ padding: spacing.lg, gap: spacing.md }}>
      <AppText variant="title" accessibilityRole="header">
        {confirming ? t("lock.reset.confirmTitle") : t("lock.reset.title")}
      </AppText>
      <AppText>
        {confirming
          ? t("lock.reset.confirmDescription")
          : t("lock.reset.description")}
      </AppText>
      {confirming ? (
        busy ? null : (
          <ActionButton
            primary
            label={t("lock.reset.confirm")}
            onPress={() => void reset()}
          />
        )
      ) : (
        <ActionButton
          primary
          label={t("lock.reset.continue")}
          onPress={() => {
            setConfirming(true);
          }}
        />
      )}
      <ActionButton label={t("lock.reset.cancel")} onPress={onCancel} />
    </View>
  );
}
