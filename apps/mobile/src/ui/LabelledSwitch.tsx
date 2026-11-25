import { useState } from "react";
import { Pressable, Switch, View } from "react-native";

import { AppText } from "./AppText";
import { colors, MIN_TOUCH_TARGET, spacing } from "./theme";

const TRACK_WIDTH = 52;
const TRACK_HEIGHT = 32;
const THUMB_SIZE = 26;
const THUMB_GAP = 3;
const THUMB_SHADOW = "0 1px 3px rgba(31,26,46,0.25)";

/** A ring around the track, visible while the switch has focus. */
function FocusRing() {
  return (
    <View
      testID="switch-focus"
      accessible={false}
      pointerEvents="none"
      style={{
        position: "absolute",
        top: -4,
        left: -4,
        width: TRACK_WIDTH + 8,
        height: TRACK_HEIGHT + 8,
        borderRadius: (TRACK_HEIGHT + 8) / 2,
        borderWidth: 2,
        borderColor: colors.text,
      }}
    />
  );
}

/** The decorative track, thumb and focus ring. */
function SwitchGraphic({
  value,
  focused,
}: {
  value: boolean;
  focused: boolean;
}) {
  return (
    <>
      <View
        testID="switch-track"
        accessible={false}
        pointerEvents="none"
        style={{
          position: "absolute",
          width: TRACK_WIDTH,
          height: TRACK_HEIGHT,
          borderRadius: TRACK_HEIGHT / 2,
          backgroundColor: value ? colors.accent : colors.borderSubtle,
          borderWidth: value ? 0 : 1.5,
          borderColor: colors.border,
        }}
      />
      <View
        testID="switch-thumb"
        accessible={false}
        pointerEvents="none"
        style={{
          position: "absolute",
          top: THUMB_GAP,
          left: value ? TRACK_WIDTH - THUMB_SIZE - THUMB_GAP : THUMB_GAP,
          width: THUMB_SIZE,
          height: THUMB_SIZE,
          borderRadius: THUMB_SIZE / 2,
          backgroundColor: colors.surface,
          boxShadow: THUMB_SHADOW,
        }}
      />
      {focused ? <FocusRing /> : null}
    </>
  );
}

/** A decorative track and thumb under a transparent native switch. */
function SwitchControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ width: TRACK_WIDTH, height: TRACK_HEIGHT }}>
      <SwitchGraphic value={value} focused={focused} />
      <Switch
        accessibilityLabel={label}
        style={{
          position: "absolute",
          width: TRACK_WIDTH,
          height: TRACK_HEIGHT,
          opacity: 0,
        }}
        value={value}
        onValueChange={onChange}
        onFocus={() => {
          setFocused(true);
        }}
        onBlur={() => {
          setFocused(false);
        }}
      />
    </View>
  );
}

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
      <SwitchControl
        label={props.label}
        value={props.value}
        onChange={props.onChange}
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
