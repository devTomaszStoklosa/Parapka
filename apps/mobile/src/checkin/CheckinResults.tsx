import { View } from "react-native";
import type { CheckinAnswers } from "@parapka/domain";

import { t } from "../i18n";
import { usePersonTones } from "../pairing/use-person-tones";
import { usePlatform } from "../platform/context";
import { AppText } from "../ui/AppText";
import { colors, radii, spacing } from "../ui/theme";
import { QUESTIONS, valueText } from "./checkin-questions";
import { personColors, type PersonColors } from "./person-colors";

const DOT = 12;

/** Five dots, as many filled as the value; hidden from readers, the text says it. */
function Dots(props: { value: number | undefined; person: PersonColors }) {
  const { value = 0, person } = props;
  return (
    <View
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: "row", gap: spacing.xs }}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <View
          key={n}
          style={{
            width: DOT,
            height: DOT,
            borderRadius: DOT / 2,
            borderWidth: 2,
            borderColor: n <= value ? person.dot : colors.border,
            backgroundColor: n <= value ? person.dot : colors.surface,
          }}
        />
      ))}
    </View>
  );
}

/** One person's column: the text, with the dots above it in the answers. */
function Column(props: {
  text: string;
  person: PersonColors;
  value: number | undefined;
  dots: boolean | undefined;
}) {
  const { text, person, value, dots } = props;
  const label = (
    <AppText
      style={{ flex: dots === true ? undefined : 1, color: person.text }}
    >
      {text}
    </AppText>
  );
  if (dots !== true) return label;
  return (
    <View style={{ flex: 1, gap: spacing.xs }}>
      <Dots value={value} person={person} />
      {label}
    </View>
  );
}

/** Two equal columns: "You" is always the left one. */
function Pair(props: {
  left: string;
  right: string;
  label?: string;
  leftValue?: number;
  rightValue?: number;
  tones: { own: PersonColors; partner: PersonColors };
  dots?: boolean;
}) {
  const { left, right, label, tones, dots } = props;
  return (
    <View
      role={label === undefined ? undefined : "group"}
      accessibilityLabel={label}
      style={{ flexDirection: "row", gap: spacing.md }}
    >
      <Column
        text={left}
        person={tones.own}
        value={props.leftValue}
        dots={dots}
      />
      <Column
        text={right}
        person={tones.partner}
        value={props.rightValue}
        dots={dots}
      />
    </View>
  );
}

function Bubble(props: { text: string; person: PersonColors }) {
  return (
    <View
      style={{
        flex: 1,
        padding: spacing.sm,
        borderRadius: radii.card,
        backgroundColor: props.person.tint,
      }}
    >
      <AppText style={{ color: props.person.text }}>{props.text}</AppText>
    </View>
  );
}

function useColumnColors() {
  const { own, partner } = usePersonTones(usePlatform());
  return { own: personColors(own), partner: personColors(partner) };
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
  const tones = useColumnColors();
  const name = props.partnerName ?? t("checkin.results.partner");
  const none = t("checkin.results.none");
  return (
    <View style={{ gap: spacing.md }}>
      <AppText variant="title">{t("checkin.results.title")}</AppText>
      <Pair left={t("checkin.results.you")} right={name} tones={tones} />
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
              tones={tones}
              dots
              leftValue={own?.[key]}
              rightValue={partner?.[key]}
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
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <Bubble text={own?.need ?? none} person={tones.own} />
          <Bubble text={partner?.need ?? none} person={tones.partner} />
        </View>
      </View>
    </View>
  );
}
