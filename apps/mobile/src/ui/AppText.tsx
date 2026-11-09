import { Text, type TextProps } from "react-native";

import { colors, fontSizes } from "./theme";

type Variant = "body" | "title";

/** Text with the theme; font size follows the system setting. */
export function AppText({
  variant = "body",
  style,
  ...rest
}: TextProps & { variant?: Variant }) {
  return (
    <Text
      {...rest}
      style={[
        { color: colors.text, fontSize: fontSizes[variant] },
        variant === "title" && { fontWeight: "bold" },
        style,
      ]}
    />
  );
}
