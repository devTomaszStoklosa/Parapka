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

/** The number of the week from `YYYY-Www`, without the leading zero. */
const weekNumber = (week: string) => String(Number(week.slice(6)));

/** A bar of two parts, as high as the shares. */
function Bar({ split }: { split: MentalLoadSplit }) {
  return (
    <View testID="trend-bar" style={{ height: "100%" }}>
      <View
        style={{
          height: `${String(split.partner)}%`,
          backgroundColor: colors.textMuted,
        }}
      />
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
      style={{ flex: 1, alignItems: "center", marginHorizontal: 1 }}
    >
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
        {trend.slice(-MENTAL_LOAD_TREND_MAX_WEEKS).map((snapshot) => (
          <Column key={snapshot.week} snapshot={snapshot} name={name} />
        ))}
      </View>
    </View>
  );
}
