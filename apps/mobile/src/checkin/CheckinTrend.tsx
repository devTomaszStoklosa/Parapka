import { View } from "react-native";

import { t } from "../i18n";
import { AppText } from "../ui/AppText";
import { colors, spacing } from "../ui/theme";
import { QUESTIONS, valueText } from "./checkin-questions";
import {
  chronological,
  rangeText,
  weekNumber,
  type HistoryEntry,
} from "./checkin-history-model";

const HEIGHT = 72;
const DOT = 10;
const MAX = 5;

/** One answer as a dot, as high as the value; the color tells only the person. */
function Dot(props: {
  entry: HistoryEntry;
  value: number;
  person: string;
  color: string;
  left: string;
}) {
  const { entry, value, person, color, left } = props;
  return (
    <View
      accessible
      role="img"
      accessibilityLabel={t("checkin.history.point", {
        range: rangeText(entry.window),
        person,
        value: valueText(value),
      })}
      style={{
        position: "absolute",
        left: left as `${number}%`,
        bottom: `${String(((value - 1) / (MAX - 1)) * 80)}%`,
        width: DOT,
        height: DOT,
        borderRadius: DOT / 2,
        backgroundColor: color,
      }}
    />
  );
}

function Series(props: {
  question: (typeof QUESTIONS)[number];
  entries: readonly HistoryEntry[];
  name: string | null;
}) {
  const { question, entries, name } = props;
  const { key, label } = question;
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText style={{ color: colors.textMuted }}>{t(label)}</AppText>
      <View style={{ flexDirection: "row" }}>
        {entries.map((entry) => (
          <View key={entry.week} style={{ flex: 1, alignItems: "center" }}>
            <View style={{ width: "100%", height: HEIGHT }}>
              <Dot
                entry={entry}
                value={entry.own[key]}
                person={t("checkin.results.you")}
                color={colors.accent}
                left="15%"
              />
              {entry.partner === null || name === null ? null : (
                <Dot
                  entry={entry}
                  value={entry.partner[key]}
                  person={name}
                  color={colors.textMuted}
                  left="55%"
                />
              )}
            </View>
            <AppText style={{ color: colors.textMuted, fontSize: 11 }}>
              {t("checkin.history.week", { number: weekNumber(entry.week) })}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

/** The legend: the colors mean the people only. */
function Legend({ name }: { name: string | null }) {
  const people = [
    { text: t("checkin.results.you"), color: colors.accent },
    ...(name === null ? [] : [{ text: name, color: colors.textMuted }]),
  ];
  return (
    <View
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: "row", gap: spacing.md }}
    >
      {people.map(({ text, color }) => (
        <View
          key={text}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.xs,
          }}
        >
          <View
            style={{
              width: DOT,
              height: DOT,
              borderRadius: DOT / 2,
              backgroundColor: color,
            }}
          />
          <AppText style={{ fontSize: 12 }}>{text}</AppText>
        </View>
      ))}
    </View>
  );
}

/**
 * Plain dots of 1–5 per question, the oldest week first. `name` is null when no
 * week was revealed, so the partner has no series. No lines, sums or verdicts.
 */
export function CheckinTrend(props: {
  entries: readonly HistoryEntry[];
  partnerName: string | null;
}) {
  const { entries, partnerName } = props;
  const weeks = chronological(entries);
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText accessibilityRole="header" style={{ fontWeight: "bold" }}>
        {t("checkin.history.trendTitle")}
      </AppText>
      {QUESTIONS.map((question) => (
        <Series
          key={question.key}
          question={question}
          entries={weeks}
          name={partnerName}
        />
      ))}
      <Legend name={partnerName} />
    </View>
  );
}
