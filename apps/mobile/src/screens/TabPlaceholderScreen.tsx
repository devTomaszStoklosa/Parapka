import { Pressable, View } from "react-native";

import { t } from "../i18n";
import type { TabId } from "../navigation/stack-state";
import { AppText } from "../ui/AppText";
import { colors, MIN_TOUCH_TARGET, spacing } from "../ui/theme";

export function TabPlaceholderScreen({
  tab,
  depth,
  onPush,
  onPop,
}: {
  tab: TabId;
  depth: number;
  onPush: () => void;
  onPop: () => void;
}) {
  const button = {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: colors.accent,
  } as const;
  return (
    <View style={{ flex: 1, padding: spacing.md }}>
      <AppText variant="title" accessibilityRole="header">
        {t(`screens.${tab}.title`)}
      </AppText>
      <AppText>{t("screens.depth", { level: depth })}</AppText>
      <Pressable accessibilityRole="button" onPress={onPush} style={button}>
        <AppText style={{ color: colors.onAccent }}>
          {t("screens.push")}
        </AppText>
      </Pressable>
      {depth > 1 && (
        <Pressable accessibilityRole="button" onPress={onPop} style={button}>
          <AppText style={{ color: colors.onAccent }}>
            {t("screens.pop")}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}
