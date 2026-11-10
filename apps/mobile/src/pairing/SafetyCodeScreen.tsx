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
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void inviter.confirm().then(onConfirmed);
        }}
        style={button}
      >
        <AppText style={{ color: colors.onAccent }}>
          {t("pairing.safety.same")}
        </AppText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void inviter.reject().then(onRejected);
        }}
        style={button}
      >
        <AppText style={{ color: colors.onAccent }}>
          {t("pairing.safety.different")}
        </AppText>
      </Pressable>
    </View>
  );
}
