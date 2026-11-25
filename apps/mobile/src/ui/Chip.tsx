import { Pressable, View } from "react-native";

import { AppText } from "./AppText";
import { colors, MIN_TOUCH_TARGET, radii, spacing } from "./theme";

export type ChipTone = "neutral" | "personA" | "personB" | "dark";

const tones = {
  neutral: { background: colors.track, text: colors.text },
  personA: { background: colors.personATint, text: colors.personAText },
  personB: { background: colors.personBTint, text: colors.personBText },
  dark: { background: colors.text, text: colors.onAccent },
} as const;

/** A pill label; with `onPress` it is a choice with a `selected` state. */
export function Chip(props: {
  label: string;
  tone?: ChipTone;
  selected?: boolean;
  onPress?: () => void;
}) {
  const tone = tones[props.selected ? "dark" : (props.tone ?? "neutral")];
  const pill = (
    <View
      style={{
        height: 28,
        paddingHorizontal: spacing.sm + spacing.xs,
        justifyContent: "center",
        borderRadius: radii.pill,
        backgroundColor: tone.background,
      }}
    >
      <AppText style={{ fontSize: 12, fontWeight: "700", color: tone.text }}>
        {props.label}
      </AppText>
    </View>
  );
  if (!props.onPress) return pill;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected === true }}
      aria-selected={props.selected === true}
      onPress={props.onPress}
      style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }}
    >
      {pill}
    </Pressable>
  );
}
