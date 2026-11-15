import { ScrollView } from "react-native";

import { CheckinCard } from "../checkin/CheckinCard";
import { t } from "../i18n";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";
import { OwnHintCard } from "./OwnHintCard";
import { PartnerHintCard } from "./PartnerHintCard";

/**
 * The "Today" tab: the hint of the partner, the preview of the own hint and
 * the check-in card. The own hint shows only with the cycle panel, i.e. when
 * `onOpenCycle` (the switch to the "Cycle" tab) is given.
 */
export function TodayScreen({ onOpenCycle }: { onOpenCycle?: () => void }) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
    >
      <AppText variant="title" accessibilityRole="header">
        {t("screens.today.title")}
      </AppText>
      <PartnerHintCard />
      {onOpenCycle ? <OwnHintCard onOpenCycle={onOpenCycle} /> : null}
      <CheckinCard />
    </ScrollView>
  );
}
