import type { PhaseDescription } from "@parapka/content";
import type { CyclePhase, GrammaticalForm } from "@parapka/domain";
import { View } from "react-native";

import { t } from "../i18n";
import { AppText } from "../ui/AppText";
import { colors, spacing } from "../ui/theme";

/** The card "Today" (FR-CYC-04): the estimated phase and its library text. */
export function PhaseCard(props: {
  phase: CyclePhase;
  description: PhaseDescription | undefined;
  form: GrammaticalForm;
}) {
  const { phase, description, form } = props;
  return (
    <View
      style={{
        marginTop: spacing.md,
        padding: spacing.md,
        gap: spacing.xs,
        backgroundColor: colors.surface,
      }}
    >
      <AppText accessibilityRole="header">{t("cycle.today")}</AppText>
      <AppText variant="title">
        {t("cycle.phaseEstimate", { name: t(`cycle.phases.${phase}`) })}
      </AppText>
      {description ? <AppText>{description.text[form]}</AppText> : null}
      {description?.review === "unreviewed" ? (
        <AppText style={{ color: colors.textMuted }}>
          {t("cycle.draft")}
        </AppText>
      ) : null}
    </View>
  );
}
