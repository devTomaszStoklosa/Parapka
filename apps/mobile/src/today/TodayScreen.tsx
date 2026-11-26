import { ScrollView, View } from "react-native";

import { CheckinCard } from "../checkin/CheckinCard";
import { t } from "../i18n";
import { usePlatform } from "../platform/context";
import { AppText } from "../ui/AppText";
import { colors, spacing } from "../ui/theme";
import { OwnHintCard } from "./OwnHintCard";
import { PartnerHintCard } from "./PartnerHintCard";
import { TodayChores } from "./TodayChores";
import { TodayPause } from "./TodayPause";

const dateFormat = new Intl.DateTimeFormat("pl-PL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** Today's date above the title; plain text, so the title stays the only header. */
function TodayDate() {
  const { clock } = usePlatform();
  return (
    <AppText style={{ fontSize: 13, color: colors.textMuted }}>
      {dateFormat.format(clock.nowMs())}
    </AppText>
  );
}

/**
 * The "Today" tab: the hint of the partner, the preview of the own hint, the chores of
 * today, the check-in card and the pause switch. The own hint shows only with the cycle panel,
 * i.e. when `onOpenCycle` (the switch to the "Cycle" tab) is given; `onOpenPlanner` switches
 * to the "Planner" tab.
 */
export function TodayScreen(props: {
  onOpenCycle?: () => void;
  onOpenPlanner: () => void;
}) {
  const { onOpenCycle, onOpenPlanner } = props;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 20, gap: 12 }}
    >
      <View style={{ gap: spacing.xs }}>
        <TodayDate />
        <AppText variant="title" accessibilityRole="header">
          {t("screens.today.title")}
        </AppText>
      </View>
      <PartnerHintCard />
      {onOpenCycle ? <OwnHintCard onOpenCycle={onOpenCycle} /> : null}
      <TodayChores onOpenPlanner={onOpenPlanner} />
      <CheckinCard />
      <TodayPause />
    </ScrollView>
  );
}
