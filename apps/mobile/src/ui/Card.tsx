import type { ReactNode } from "react";
import { View } from "react-native";

import { colors, radii, shadows, spacing } from "./theme";

export type CardTone = "surface" | "personATint" | "personBTint" | "dark";

const backgrounds = {
  surface: colors.surface,
  personATint: colors.personATint,
  personBTint: colors.personBTint,
  dark: colors.text,
} as const;

/** A rounded card with a soft shadow. */
export function Card(props: { tone?: CardTone; children?: ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: backgrounds[props.tone ?? "surface"],
        borderRadius: radii.card,
        padding: spacing.md + spacing.xs,
        ...shadows.card,
      }}
    >
      {props.children}
    </View>
  );
}
