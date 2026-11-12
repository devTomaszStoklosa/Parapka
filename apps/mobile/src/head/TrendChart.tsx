import {
  MENTAL_LOAD_TREND_MAX_WEEKS,
  type MentalLoadSnapshot,
  type MentalLoadSplit,
} from "@parapka/domain";
import { View } from "react-native";

import { t } from "../i18n";
import { AppText } from "../ui/AppText";
import { colors, spacing } from "../ui/theme";

const BAR_HEIGHT = 72;
const MAX_WEEKS = MENTAL_LOAD_TREND_MAX_WEEKS;

/** The number of the week from `YYYY-Www`, without the leading zero. */
const weekNumber = (week: string) => String(Number(week.slice(6)));

/** A bar of two parts, as high as the shares. */
function Bar({ split }: { split: MentalLoadSplit }) {
  return (
    <View testID="trend-bar" style={{ height: "100%" }}>
      {split.partner === 0 ? null : (
        <View
          testID="trend-partner"
          style={{
            height: `${String(split.partner)}%`,
            backgroundColor: colors.textMuted,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        />
      )}
      <View
        style={{
          height: `${String(split.me)}%`,
          backgroundColor: colors.accent,
        }}
      />
    </View>
  );
}

function Column(props: { snapshot: MentalLoadSnapshot; name: string }) {
  const { snapshot, name } = props;
  const { split } = snapshot;
  const number = weekNumber(snapshot.week);
  const label =
    split === null
      ? t("head.trend.barEmpty", { number })
      : t("head.trend.bar", {
          number,
          me: split.me,
          name,
          partner: split.partner,
        });
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        width: `${String(100 / MAX_WEEKS)}%`,
        paddingHorizontal: 1,
        alignItems: "center",
      }}
    >
      <AppText style={{ color: colors.accent, fontSize: 10 }}>
        {split === null ? " " : t("head.trend.share", { me: split.me })}
      </AppText>
      <View
        style={{
          width: "100%",
          height: BAR_HEIGHT,
          backgroundColor: split === null ? colors.surface : undefined,
        }}
      >
        {split === null ? null : <Bar split={split} />}
      </View>
      <AppText style={{ color: colors.textMuted, fontSize: 11 }}>
        {split === null
          ? t("head.trend.none")
          : t("head.trend.week", { number })}
      </AppText>
    </View>
  );
}

/** What the two colors of a bar mean; the bar labels already say it. */
function Legend({ name }: { name: string }) {
  const swatch = (color: string, border: string) => ({
    width: 12,
    height: 12,
    backgroundColor: color,
    borderWidth: 1,
    borderColor: border,
  });
  return (
    <View
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={{
        flexDirection: "row",
        gap: spacing.md,
        marginTop: spacing.sm,
      }}
    >
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}
      >
        <View style={swatch(colors.accent, colors.accent)} />
        <AppText style={{ fontSize: 12 }}>{t("head.trend.legendMe")}</AppText>
      </View>
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}
      >
        <View style={swatch(colors.textMuted, colors.border)} />
        <AppText style={{ fontSize: 12 }}>{name}</AppText>
      </View>
    </View>
  );
}

/** Bars of the last weeks, one per week, made of plain views. */
export function TrendChart(props: {
  trend: readonly MentalLoadSnapshot[];
  partnerName: string | null;
}) {
  const { trend, partnerName } = props;
  if (trend.length === 0) return null;
  const name = partnerName ?? t("head.carriers.partner");
  return (
    <View style={{ marginTop: spacing.md }}>
      <AppText accessibilityRole="header" style={{ fontWeight: "bold" }}>
        {t("head.trend.title")}
      </AppText>
      <View style={{ flexDirection: "row", marginTop: spacing.sm }}>
        {trend.slice(-MAX_WEEKS).map((snapshot) => (
          <Column key={snapshot.week} snapshot={snapshot} name={name} />
        ))}
      </View>
      <Legend name={name} />
    </View>
  );
}
