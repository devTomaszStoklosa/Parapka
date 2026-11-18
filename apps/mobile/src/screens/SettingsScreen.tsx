import { ScrollView } from "react-native";

import { CheckinScheduleEntry } from "../checkin/CheckinScheduleSettings";
import { DeleteAllData } from "../data-control/DeleteAllData";
import { ExportData } from "../data-control/ExportData";
import { CyclePanelSettings } from "../cycle/CyclePanelSettings";
import { t } from "../i18n";
import { PrivacySettings } from "../consent/PrivacySettings";
import { useConsentWiring } from "../consent/wiring";
import { NotificationSettings } from "../notifications/NotificationSettings";
import { PairingEntry } from "../pairing/PairingEntry";
import { usePlatform } from "../platform/context";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";

export function SettingsScreen() {
  const { consent, profiles } = useConsentWiring(usePlatform());
  return (
    <ScrollView
      testID="settings-scroll"
      contentContainerStyle={{ padding: spacing.md }}
    >
      <AppText variant="title" accessibilityRole="header">
        {t("screens.settings.title")}
      </AppText>
      <AppText style={{ fontWeight: "bold", marginTop: spacing.md }}>
        {t("pairing.title")}
      </AppText>
      <PairingEntry />
      <CheckinScheduleEntry />
      <PrivacySettings consent={consent} profiles={profiles} />
      <CyclePanelSettings />
      <NotificationSettings />
      <ExportData />
      <DeleteAllData />
    </ScrollView>
  );
}
