import { View } from "react-native";

import { t } from "../i18n";
import { usePersonTones } from "../pairing/use-person-tones";
import { usePlatform } from "../platform/context";
import { AppText } from "../ui/AppText";
import { Card } from "../ui/Card";
import { Chip } from "../ui/Chip";
import { spacing } from "../ui/theme";
import type { PersonTones } from "../pairing/person-tone";
import { personColors } from "./person-colors";
import { QUESTIONS, valueText } from "./checkin-questions";
import { rangeText, type HistoryEntry } from "./checkin-history-model";
import { CheckinTrend } from "./CheckinTrend";
import { useCheckinHistory } from "./use-checkin-history";

/** The answers of one week; the partner column is "—" for any missing answers. */
function Week(props: {
  entry: HistoryEntry;
  name: string | null;
  tones: PersonTones;
}) {
  const { entry, name, tones } = props;
  const none = t("checkin.results.none");
  return (
    <Card>
      <View style={{ gap: spacing.xs }}>
        <AppText accessibilityRole="header" style={{ fontWeight: "bold" }}>
          {rangeText(entry.window)}
        </AppText>
        <View style={{ flexDirection: "row", gap: spacing.xs }}>
          <Chip
            label={t("checkin.results.you")}
            tone={personColors(tones.own).chip}
          />
          {name === null ? null : (
            <Chip label={name} tone={personColors(tones.partner).chip} />
          )}
        </View>
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
                    entry.partner === null
                      ? none
                      : valueText(entry.partner[key]),
                });
          return <AppText key={key}>{text}</AppText>;
        })}
      </View>
    </Card>
  );
}

/**
 * The last weeks of the check-in: the own answers and, for the revealed weeks
 * only, the answers of the partner (FR-CHK-09). Neutral: no sums, no
 * comparisons.
 */
export function CheckinHistory() {
  const platform = usePlatform();
  const state = useCheckinHistory(platform);
  const tones = usePersonTones(platform);
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
      <CheckinTrend entries={entries} partnerName={name} tones={tones} />
      {entries.map((entry) => (
        <Week key={entry.week} entry={entry} name={name} tones={tones} />
      ))}
    </View>
  );
}
