import { View } from "react-native";

import { t } from "../i18n";
import { PairingEntry } from "../pairing/PairingEntry";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";

export function SettingsScreen() {
  return (
    <View style={{ flex: 1, padding: spacing.md }}>
      <AppText variant="title" accessibilityRole="header">
        {t("screens.settings.title")}
      </AppText>
      <AppText style={{ fontWeight: "bold", marginTop: spacing.md }}>
        {t("pairing.title")}
      </AppText>
      <PairingEntry />
    </View>
  );
}
