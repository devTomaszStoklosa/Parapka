import { View } from "react-native";
import type { CheckinAnswers } from "@parapka/domain";

import { t } from "../i18n";
import { AppText } from "../ui/AppText";
import { colors, spacing } from "../ui/theme";
import { QUESTIONS, valueText } from "./checkin-questions";

/** Two equal columns: "You" is always the left one. */
function Pair(props: { left: string; right: string; label?: string }) {
  const { left, right, label } = props;
  return (
    <View
      role={label === undefined ? undefined : "group"}
      accessibilityLabel={label}
      style={{ flexDirection: "row", gap: spacing.md }}
    >
      <AppText style={{ flex: 1 }}>{left}</AppText>
      <AppText style={{ flex: 1 }}>{right}</AppText>
    </View>
  );
}

/**
 * Both check-ins side by side once revealed (FR-CHK-05). Read-only and neutral:
 * the same style for every value and for both people, no sums or comparisons.
 */
export function CheckinResults(props: {
  own: CheckinAnswers | null;
  partner: CheckinAnswers | null;
  partnerName: string | null;
}) {
  const { own, partner } = props;
  const name = props.partnerName ?? t("checkin.results.partner");
  const none = t("checkin.results.none");
  return (
    <View style={{ gap: spacing.md }}>
      <AppText variant="title">{t("checkin.results.title")}</AppText>
      <Pair left={t("checkin.results.you")} right={name} />
      {QUESTIONS.map(({ key, label }) => {
        const question = t(label);
        const mine = own === null ? none : valueText(own[key]);
        const theirs = partner === null ? none : valueText(partner[key]);
        return (
          <View key={key} style={{ gap: spacing.xs }}>
            <AppText style={{ color: colors.textMuted }}>{question}</AppText>
            <Pair
              left={mine}
              right={theirs}
              label={t("checkin.results.row", {
                question,
                own: mine,
                name,
                other: theirs,
              })}
            />
          </View>
        );
      })}
      <View style={{ gap: spacing.xs }}>
        <AppText style={{ color: colors.textMuted }}>
          {t("checkin.form.need")}
        </AppText>
        <Pair left={own?.need ?? none} right={partner?.need ?? none} />
      </View>
    </View>
  );
}
