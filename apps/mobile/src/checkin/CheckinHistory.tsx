import { View } from "react-native";

import { t } from "../i18n";
import { usePlatform } from "../platform/context";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";
import { QUESTIONS, valueText } from "./checkin-questions";
import { rangeText, type HistoryEntry } from "./checkin-history-model";
import { CheckinTrend } from "./CheckinTrend";
import { useCheckinHistory } from "./use-checkin-history";

/** The answers of one week; the partner column is "—" for any missing answers. */
function Week(props: { entry: HistoryEntry; name: string | null }) {
  const { entry, name } = props;
  const none = t("checkin.results.none");
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText accessibilityRole="header" style={{ fontWeight: "bold" }}>
        {rangeText(entry.window)}
      </AppText>
      {QUESTIONS.map(({ key, label }) => {
        const question = t(label);
        const own = valueText(entry.own[key]);
        const text =
          name === null
            ? t("checkin.history.own", { question, value: own })
            : t("checkin.results.row", {
                question,
                own,
                name,
                other:
                  entry.partner === null ? none : valueText(entry.partner[key]),
              });
        return <AppText key={key}>{text}</AppText>;
      })}
    </View>
  );
}

/**
 * The last weeks of the check-in: the own answers and, for the revealed weeks
 * only, the answers of the partner (FR-CHK-09). Neutral: no sums, no
 * comparisons.
 */
export function CheckinHistory() {
  const state = useCheckinHistory(usePlatform());
  if (state === null) return null;
  if (state === "failed") {
    return (
      <AppText accessibilityRole="alert">{t("checkin.history.failed")}</AppText>
    );
  }
  const { entries } = state;
  if (entries.length === 0) {
    return <AppText>{t("checkin.history.empty")}</AppText>;
  }
  // Without a revealed week the history looks like one of a person without a pair.
  const name = entries.some(({ partner }) => partner !== null)
    ? (state.partnerName ?? t("checkin.results.partner"))
    : null;
  return (
    <View style={{ gap: spacing.md }}>
      <AppText variant="title">{t("checkin.history.title")}</AppText>
      <CheckinTrend entries={entries} partnerName={name} />
      {entries.map((entry) => (
        <Week key={entry.week} entry={entry} name={name} />
      ))}
    </View>
  );
}
