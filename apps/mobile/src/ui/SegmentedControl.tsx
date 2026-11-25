import { Pressable, View } from "react-native";

import { AppText } from "./AppText";
import { colors, MIN_TOUCH_TARGET, radii, spacing } from "./theme";

/** Two or three options in a pill; the chosen one is `selected`. */
export function SegmentedControl<T extends string>(props: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        padding: spacing.xs,
        borderRadius: radii.pill,
        backgroundColor: colors.track,
      }}
    >
      {props.options.map((option) => {
        const selected = option.value === props.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            aria-selected={selected}
            onPress={() => {
              if (!selected) props.onChange(option.value);
            }}
            style={{
              flex: 1,
              minHeight: MIN_TOUCH_TARGET,
              justifyContent: "center",
              alignItems: "center",
              borderRadius: radii.pill,
              backgroundColor: selected ? colors.surface : "transparent",
            }}
          >
            <AppText style={{ fontWeight: selected ? "700" : "400" }}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
