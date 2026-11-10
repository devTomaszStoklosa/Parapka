import { useState } from "react";
import { Pressable, View } from "react-native";

import { t } from "../i18n";
import { AppText } from "../ui/AppText";
import { colors, MIN_TOUCH_TARGET, spacing } from "../ui/theme";
import type { Inviter } from "./inviter";

const button = {
  minHeight: MIN_TOUCH_TARGET,
  minWidth: MIN_TOUCH_TARGET,
  justifyContent: "center",
  paddingHorizontal: spacing.md,
  marginTop: spacing.sm,
  backgroundColor: colors.accent,
} as const;

function ActionButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={button}>
      <AppText style={{ color: colors.onAccent }}>{label}</AppText>
    </Pressable>
  );
}

/** The six digits both phones show; the person compares them with the partner. */
export function SafetyCodeScreen({
  code,
  inviter,
  onConfirmed,
  onRejected,
}: {
  code: string;
  inviter: Pick<Inviter, "confirm" | "reject">;
  onConfirmed: () => void;
  onRejected: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const run = (action: () => Promise<void>, done: () => void) => () => {
    setFailed(false);
    action().then(done, () => {
      setFailed(true);
    });
  };
  return (
    <View>
      <AppText variant="title">{t("pairing.safety.title")}</AppText>
      <AppText>{t("pairing.safety.instruction")}</AppText>
      <AppText
        variant="title"
        accessibilityLabel={code.split("").join(" ")}
        style={{ marginVertical: spacing.md }}
      >
        {code}
      </AppText>
      <ActionButton
        label={t("pairing.safety.same")}
        onPress={run(() => inviter.confirm(), onConfirmed)}
      />
      <ActionButton
        label={t("pairing.safety.different")}
        onPress={run(() => inviter.reject(), onRejected)}
      />
      {failed && (
        <AppText accessibilityRole="alert">{t("pairing.unavailable")}</AppText>
      )}
    </View>
  );
}
