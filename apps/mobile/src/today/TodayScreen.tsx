import { ScrollView } from "react-native";

import { CheckinCard } from "../checkin/CheckinCard";
import { t } from "../i18n";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";

/** The "Today" tab: the check-in card; the other sections come below it. */
export function TodayScreen() {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
    >
      <AppText variant="title" accessibilityRole="header">
        {t("screens.today.title")}
      </AppText>
      <CheckinCard />
    </ScrollView>
  );
}
