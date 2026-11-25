import { Pressable, View } from "react-native";

import { t } from "../i18n";
import { AppText } from "../ui/AppText";
import { Icon } from "../ui/Icon";
import {
  colors,
  fontSizes,
  MIN_TOUCH_TARGET,
  radii,
  spacing,
} from "../ui/theme";
import type { TabId } from "./stack-state";

export const TAB_BAR_HEIGHT = 68;
export const TAB_BAR_BOTTOM = spacing.lg;
export const TAB_BAR_SIDE = spacing.md;
const TAB_BAR_PADDING = 4;
const ACTIVE_PADDING = 6;
const ACTIVE_ICON = 20;
const ACTIVE_GAP = 4;
const INACTIVE_SIZE = 52;

/**
 * Narrowest width of the bar: the active tab with its label, the other tabs
 * shrunk to the touch target and the padding of the pill.
 */
export function tabBarMinWidth(count: number, labelWidth: number): number {
  return (
    2 * TAB_BAR_PADDING +
    2 * ACTIVE_PADDING +
    ACTIVE_ICON +
    ACTIVE_GAP +
    labelWidth +
    (count - 1) * MIN_TOUCH_TARGET
  );
}

const icons = {
  today: "today",
  cycle: "cycle",
  planner: "planner",
  head: "head",
  settings: "settings",
} as const satisfies Record<TabId, string>;

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
        position: "absolute",
        left: TAB_BAR_SIDE,
        right: TAB_BAR_SIDE,
        bottom: TAB_BAR_BOTTOM,
        height: TAB_BAR_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-around",
        paddingHorizontal: TAB_BAR_PADDING,
        backgroundColor: colors.text,
        borderRadius: radii.pill,
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

function tabStyle(selected: boolean) {
  return {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: ACTIVE_GAP,
    minWidth: MIN_TOUCH_TARGET,
    minHeight: INACTIVE_SIZE,
    borderRadius: radii.pill,
    ...(selected
      ? {
          flexShrink: 0,
          paddingHorizontal: ACTIVE_PADDING,
          backgroundColor: colors.surface,
        }
      : { flexShrink: 1, width: INACTIVE_SIZE }),
  } as const;
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
      style={tabStyle(selected)}
    >
      <Icon
        name={icons[tab]}
        size={ACTIVE_ICON}
        color={selected ? colors.text : colors.onDark}
      />
      {selected ? (
        <AppText
          style={{
            fontSize: fontSizes.tab,
            fontWeight: "bold",
            color: colors.text,
          }}
        >
          {t(`tabs.${tab}`)}
        </AppText>
      ) : null}
    </Pressable>
  );
}
