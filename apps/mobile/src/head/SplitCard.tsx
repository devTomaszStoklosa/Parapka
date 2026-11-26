import type { MentalLoadSplit } from "@parapka/domain";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { personColors } from "../checkin/person-colors";
import { t } from "../i18n";
import type { PersonTones } from "../pairing/person-tone";
import { AppText } from "../ui/AppText";
import { Card } from "../ui/Card";
import { colors, spacing } from "../ui/theme";

const SIZE = 120;
const RADIUS = 40;
const STROKE = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** One arc of the ring; it starts `from` percent after the top. */
function Arc(props: {
  testID: string;
  color: string;
  from: number;
  percent: number;
}) {
  const { testID, color, from, percent } = props;
  const length = (CIRCUMFERENCE * percent) / 100;
  return (
    <Circle
      testID={testID}
      cx={50}
      cy={50}
      r={RADIUS}
      fill="none"
      stroke={color}
      strokeWidth={STROKE}
      strokeDasharray={`${String(length)} ${String(CIRCUMFERENCE)}`}
      strokeDashoffset={-(CIRCUMFERENCE * from) / 100}
      transform="rotate(-90 50 50)"
    />
  );
}

/** The arcs of the ring, hidden from readers. */
function Arcs(props: { split: MentalLoadSplit; tones: PersonTones }) {
  const { split, tones } = props;
  return (
    <View
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", width: SIZE, height: SIZE }}
    >
      <Svg width={SIZE} height={SIZE} viewBox="0 0 100 100">
        {split.me === 0 ? null : (
          <Arc
            testID="split-me"
            color={personColors(tones.own).dot}
            from={0}
            percent={split.me}
          />
        )}
        {split.partner === 0 ? null : (
          <Arc
            testID="split-partner"
            color={personColors(tones.partner).dot}
            from={split.me}
            percent={split.partner}
          />
        )}
      </Svg>
    </View>
  );
}

/** The ring of two arcs, as long as the shares; the arcs are decoration. */
function Ring(props: {
  split: MentalLoadSplit;
  name: string;
  tones: PersonTones;
  openCount?: number;
}) {
  const { split, name, tones, openCount } = props;
  const label = [
    t("head.split.me", { percent: split.me }),
    t("head.split.partner", { name, percent: split.partner }),
  ].join(", ");
  return (
    <View
      accessible
      role="img"
      accessibilityLabel={label}
      style={{
        width: SIZE,
        height: SIZE,
        alignSelf: "center",
        alignItems: "center",
        justifyContent: "center",
        marginVertical: spacing.sm,
      }}
    >
      <Arcs split={split} tones={tones} />
      {openCount === undefined ? null : (
        <AppText variant="title" aria-hidden>
          {String(openCount)}
        </AppText>
      )}
    </View>
  );
}

function LegendEntry(props: { color: string; text: string }) {
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}
    >
      <View
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: props.color,
        }}
      />
      <AppText>{props.text}</AppText>
    </View>
  );
}

/** The current split of the shared open things, without any judgement. */
export function SplitCard(props: {
  split: MentalLoadSplit | null;
  partnerName: string | null;
  tones: PersonTones;
  openCount?: number;
}) {
  const { split, partnerName, tones, openCount } = props;
  const name = partnerName ?? t("head.carriers.partner");
  return (
    <Card>
      <AppText accessibilityRole="header" style={{ fontWeight: "bold" }}>
        {t("head.split.title")}
      </AppText>
      {split === null ? (
        <AppText>{t("head.split.empty")}</AppText>
      ) : (
        <View>
          <Ring split={split} name={name} tones={tones} openCount={openCount} />
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: spacing.sm,
            }}
          >
            <LegendEntry
              color={personColors(tones.own).dot}
              text={t("head.split.me", { percent: split.me })}
            />
            <LegendEntry
              color={personColors(tones.partner).dot}
              text={t("head.split.partner", { name, percent: split.partner })}
            />
          </View>
          <AppText style={{ color: colors.textMuted }}>
            {t("head.split.basis")}
          </AppText>
        </View>
      )}
    </Card>
  );
}
