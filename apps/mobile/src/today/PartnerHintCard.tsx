import { Pressable, View } from "react-native";

import type { HintReaction } from "../cycle/hint-reaction-repository";
import { t } from "../i18n";
import { usePlatform } from "../platform/context";
import { AppText } from "../ui/AppText";
import { Card } from "../ui/Card";
import { Chip } from "../ui/Chip";
import { Icon } from "../ui/Icon";
import { colors, MIN_TOUCH_TARGET, radii, spacing } from "../ui/theme";
import { CategoryChip } from "./HintHistory";
import { PartnerHintHistory } from "./PartnerHintHistory";
import { usePartnerHint, type PartnerHintData } from "./use-partner-hint";

const CHOICES = [
  ["done", "todayHint.done", true],
  ["notToday", "todayHint.notToday", false],
] as const;

/** A reaction: a radio in the group, "done" filled and "not today" outlined. */
function ReactionButton(props: {
  label: string;
  primary: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const { label, primary, selected, onPress } = props;
  const color = primary ? colors.onAccent : colors.text;
  return (
    <Pressable
      role="radio"
      aria-checked={selected}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: MIN_TOUCH_TARGET,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.xs,
        paddingHorizontal: spacing.md,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: primary ? colors.text : colors.border,
        backgroundColor: primary ? colors.text : colors.surface,
      }}
    >
      <AppText style={{ color, fontWeight: "700" }}>
        {(selected ? "● " : "○ ") + label}
      </AppText>
    </Pressable>
  );
}

/** The hint of today and the two reactions; the reaction can be changed. */
function Hint(props: {
  data: PartnerHintData & { hint: NonNullable<PartnerHintData["hint"]> };
  onReact: (hintId: string, reaction: HintReaction) => void;
}) {
  const { data, onReact } = props;
  const { hint, reaction, partnerName } = data;
  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <View style={{ flexDirection: "row" }}>
          <Chip label={t("todayHint.chip")} tone="dark" />
        </View>
        <CategoryChip category={hint.category} tone="neutral" />
      </View>
      <AppText accessibilityRole="header">
        {partnerName === null
          ? t("todayHint.titleNoName")
          : t("todayHint.title", { name: partnerName })}
      </AppText>
      <AppText variant="title">{hint.text}</AppText>
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}
      >
        <Icon name="lock" size={16} color={colors.personBText} />
        <AppText style={{ flex: 1, fontSize: 13, color: colors.personBText }}>
          {t("todayHint.privacy")}
        </AppText>
      </View>
      <View
        role="radiogroup"
        accessibilityLabel={t("todayHint.reactions")}
        style={{ flexDirection: "row", gap: spacing.sm }}
      >
        {CHOICES.map(([choice, key, primary]) => (
          <ReactionButton
            key={choice}
            label={t(key)}
            primary={primary}
            selected={reaction === choice}
            onPress={() => {
              onReact(hint.id, choice);
            }}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * The hint of the partner for today (FR-CYC-11). A day without a hint, a
 * skipped hint and a pause look the same (FR-CYC-07, FR-PAIR-06). Without
 * a hint for today and without a shown hint of the days before (the skipped
 * ones are not shown) there is no card.
 */
export function PartnerHintCard() {
  const { state, failed, react } = usePartnerHint(usePlatform());
  if (state === null) return null;
  return (
    <Card tone="personBTint">
      <View style={{ gap: spacing.md }}>
        {state === "failed" ? (
          <AppText accessibilityRole="alert">{t("todayHint.failed")}</AppText>
        ) : state.hint === null ? (
          <AppText>{t("todayHint.none")}</AppText>
        ) : (
          <Hint
            data={{ ...state, hint: state.hint }}
            onReact={(hintId, reaction) => {
              void react(hintId, reaction);
            }}
          />
        )}
        {state === "failed" ? null : (
          <PartnerHintHistory entries={state.history} />
        )}
        {failed ? (
          <AppText accessibilityRole="alert">{t("todayHint.failed")}</AppText>
        ) : null}
      </View>
    </Card>
  );
}
