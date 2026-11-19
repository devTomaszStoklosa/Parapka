import { Pressable, Switch, View } from "react-native";

import { AppText } from "./AppText";
import { MIN_TOUCH_TARGET, spacing } from "./theme";

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
      <Pressable
        accessible={false}
        onPress={() => {
          props.onChange(!props.value);
        }}
        style={{
          flex: 1,
          minHeight: MIN_TOUCH_TARGET,
          justifyContent: "center",
        }}
      >
        <AppText>{props.label}</AppText>
        {props.hint ? <AppText>{props.hint}</AppText> : null}
      </Pressable>
    </View>
  );
}
