import { Text, type TextProps } from "react-native";

import { colors, fontSizes, fonts } from "./theme";

type Variant = "body" | "title";

const fontFamilies = { body: fonts.body, title: fonts.heading } as const;

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
        {
          color: colors.text,
          fontSize: fontSizes[variant],
          fontFamily: fontFamilies[variant],
        },
        style,
      ]}
    />
  );
}
