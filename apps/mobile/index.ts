import { BricolageGrotesque_700Bold } from "@expo-google-fonts/bricolage-grotesque/700Bold";
import { PlusJakartaSans_400Regular } from "@expo-google-fonts/plus-jakarta-sans/400Regular";
import { registerRootComponent } from "expo";
import { useFonts } from "expo-font";
import { createElement } from "react";

import { App } from "./src/App";
import { fonts } from "./src/ui/theme";

/** Loads the bundled fonts; the app renders at once with system fonts until then. */
export function Root() {
  useFonts({
    [fonts.heading]: BricolageGrotesque_700Bold,
    [fonts.body]: PlusJakartaSans_400Regular,
  });
  return createElement(App);
}

registerRootComponent(Root);
