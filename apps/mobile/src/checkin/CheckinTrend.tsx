import { View } from "react-native";
import Svg, { Polyline } from "react-native-svg";

import { t } from "../i18n";
import { AppText } from "../ui/AppText";
import type { PersonTones } from "../pairing/person-tone";
import { Card } from "../ui/Card";
import { colors, spacing } from "../ui/theme";
import { personColors } from "./person-colors";
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

/** The line through the dots of one person; decoration, hidden from readers. */
function Line(props: { points: string; color: string }) {
  return (
    <View
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", width: "100%", height: HEIGHT }}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <Polyline
          points={props.points}
          fill="none"
          stroke={props.color}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </Svg>
    </View>
  );
}

const pointsOf = (
  entries: readonly HistoryEntry[],
  left: number,
  valueOf: (entry: HistoryEntry) => number | undefined,
) =>
  entries
    .flatMap((entry, index) => {
      const value = valueOf(entry);
      return value === undefined
        ? []
        : [
            `${String(((index + left) * 100) / entries.length)},${String(
              100 - ((value - 1) / (MAX - 1)) * 80 - 5,
            )}`,
          ];
    })
    .join(" ");

function Series(props: {
  question: (typeof QUESTIONS)[number];
  entries: readonly HistoryEntry[];
  name: string | null;
  tones: PersonTones;
}) {
  const { question, entries, name, tones } = props;
  const { key, label } = question;
  const own = personColors(tones.own).dot;
  const other = personColors(tones.partner).dot;
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText style={{ color: colors.textMuted }}>{t(label)}</AppText>
      <View style={{ flexDirection: "row" }}>
        <Line points={pointsOf(entries, 0.2, (e) => e.own[key])} color={own} />
        <Line
          points={
            name === null ? "" : pointsOf(entries, 0.6, (e) => e.partner?.[key])
          }
          color={other}
        />
        {entries.map((entry) => (
          <View key={entry.week} style={{ flex: 1, alignItems: "center" }}>
            <View style={{ width: "100%", height: HEIGHT }}>
              <Dot
                entry={entry}
                value={entry.own[key]}
                person={t("checkin.results.you")}
                color={own}
                left="15%"
              />
              {entry.partner === null || name === null ? null : (
                <Dot
                  entry={entry}
                  value={entry.partner[key]}
                  person={name}
                  color={other}
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
function Legend(props: { name: string | null; tones: PersonTones }) {
  const { name, tones } = props;
  const people = [
    {
      text: t("checkin.results.you"),
      color: personColors(tones.own).dot,
    },
    ...(name === null
      ? []
      : [{ text: name, color: personColors(tones.partner).dot }]),
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
 * week was revealed, so the partner has no series. A line per person, no sums or verdicts.
 */
export function CheckinTrend(props: {
  entries: readonly HistoryEntry[];
  partnerName: string | null;
  tones: PersonTones;
}) {
  const { entries, partnerName, tones } = props;
  const weeks = chronological(entries);
  return (
    <Card>
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
            tones={tones}
          />
        ))}
        <Legend name={partnerName} tones={tones} />
      </View>
    </Card>
  );
}
