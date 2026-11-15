import type { TextProps } from "react-native";

import { AppText } from "./AppText";
import { colors } from "./theme";

/** An error message: announced as an alert, in the warning color and bold. */
export function AlertText({ style, ...rest }: TextProps) {
  return (
    <AppText
      {...rest}
      accessibilityRole="alert"
      style={[{ color: colors.danger, fontWeight: "bold" }, style]}
    />
  );
}
