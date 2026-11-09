import { useEffect, useReducer } from "react";
import { View } from "react-native";

import { TabPlaceholderScreen } from "../screens/TabPlaceholderScreen";
import { colors } from "../ui/theme";
import { initialNavState, navReducer, TAB_IDS } from "./stack-state";
import { TabBar } from "./TabBar";

export function TabNavigator({ cycleEnabled }: { cycleEnabled: boolean }) {
  const [state, dispatch] = useReducer(navReducer, initialNavState);
  const tabs = TAB_IDS.filter((tab) => cycleEnabled || tab !== "cycle");
  // The cycle tab may disappear while it is active.
  const active = tabs.includes(state.active) ? state.active : "today";

  // Keep the reducer in sync, so push and pop act on the visible tab.
  useEffect(() => {
    if (active !== state.active) {
      dispatch({ type: "select", tab: active });
    }
  }, [active, state.active]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1 }}>
        <TabPlaceholderScreen
          tab={active}
          depth={state.depth[active]}
          onPush={() => {
            dispatch({ type: "push" });
          }}
          onPop={() => {
            dispatch({ type: "pop" });
          }}
        />
      </View>
      <TabBar
        tabs={tabs}
        active={active}
        onSelect={(tab) => {
          dispatch({ type: "select", tab });
        }}
      />
    </View>
  );
}
