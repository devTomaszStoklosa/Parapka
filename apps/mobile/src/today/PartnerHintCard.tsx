import { View } from "react-native";

import type { HintReaction } from "../cycle/hint-reaction-repository";
import { t } from "../i18n";
import { Option } from "../onboarding/controls";
import { usePlatform } from "../platform/context";
import { AppText } from "../ui/AppText";
import { colors, spacing } from "../ui/theme";
import { PartnerHintHistory } from "./PartnerHintHistory";
import { usePartnerHint, type PartnerHintData } from "./use-partner-hint";

const CHOICES = [
  ["done", "todayHint.done"],
  ["notToday", "todayHint.notToday"],
] as const;

/** The hint of today and the two reactions; the reaction can be changed. */
function Hint(props: {
  data: PartnerHintData & { hint: NonNullable<PartnerHintData["hint"]> };
  onReact: (hintId: string, reaction: HintReaction) => void;
}) {
  const { data, onReact } = props;
  const { hint, reaction, partnerName } = data;
  return (
    <View style={{ gap: spacing.md }}>
      <AppText accessibilityRole="header">
        {partnerName === null
          ? t("todayHint.titleNoName")
          : t("todayHint.title", { name: partnerName })}
      </AppText>
      <AppText>{hint.text}</AppText>
      <View
        role="radiogroup"
        accessibilityLabel={t("todayHint.reactions")}
        style={{ flexDirection: "row", gap: spacing.sm }}
      >
        {CHOICES.map(([choice, key]) => (
          <Option
            key={choice}
            label={t(key)}
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
 * any received hint there is no card.
 */
export function PartnerHintCard() {
  const { state, failed, react } = usePartnerHint(usePlatform());
  if (state === null) return null;
  return (
    <View
      style={{
        gap: spacing.md,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
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
  );
}
