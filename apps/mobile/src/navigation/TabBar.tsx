import { Pressable, View } from "react-native";

import { t } from "../i18n";
import { AppText } from "../ui/AppText";
import { colors, fontSizes, MIN_TOUCH_TARGET } from "../ui/theme";
import type { TabId } from "./stack-state";

export function TabBar({
  tabs,
  active,
  onSelect,
}: {
  tabs: readonly TabId[];
  active: TabId;
  onSelect: (tab: TabId) => void;
}) {
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      {tabs.map((tab) => (
        <TabButton
          key={tab}
          tab={tab}
          selected={tab === active}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}

function TabButton({
  tab,
  selected,
  onSelect,
}: {
  tab: TabId;
  selected: boolean;
  onSelect: (tab: TabId) => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      aria-selected={selected}
      accessibilityLabel={t(`tabs.${tab}`)}
      onPress={() => {
        onSelect(tab);
      }}
      style={{
        flex: 1,
        minWidth: MIN_TOUCH_TARGET,
        minHeight: MIN_TOUCH_TARGET,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <AppText
        style={{
          fontSize: fontSizes.tab,
          color: selected ? colors.accent : colors.textMuted,
          fontWeight: selected ? "bold" : "normal",
        }}
      >
        {t(`tabs.${tab}`)}
      </AppText>
    </Pressable>
  );
}
