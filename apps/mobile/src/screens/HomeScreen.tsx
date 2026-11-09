import { HINT_DAYS_AHEAD } from "@parapka/domain";
import { Text, View } from "react-native";

import { pl } from "../i18n/pl";

export function HomeScreen() {
  return (
    <View>
      <Text>{pl.home.title}</Text>
      <Text>{pl.home.subtitle}</Text>
      <Text>{pl.home.hintWindow + " " + String(HINT_DAYS_AHEAD)}</Text>
    </View>
  );
}
