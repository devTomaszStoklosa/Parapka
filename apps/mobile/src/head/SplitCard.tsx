import type { MentalLoadSplit } from "@parapka/domain";
import { View } from "react-native";

import { t } from "../i18n";
import { AppText } from "../ui/AppText";
import { colors, spacing } from "../ui/theme";

/** The bar of two parts, as wide as the shares; `height` is its thickness. */
export function SplitBar(props: { split: MentalLoadSplit; height: number }) {
  const { split, height } = props;
  return (
    <View style={{ flexDirection: "row", height, width: "100%" }}>
      <View
        testID="split-me"
        style={{ width: `${String(split.me)}%`, backgroundColor: colors.accent }}
      />
      <View
        testID="split-partner"
        style={{
          width: `${String(split.partner)}%`,
          backgroundColor: colors.textMuted,
        }}
      />
    </View>
  );
}

/** The current split of the shared open things, without any judgement. */
export function SplitCard(props: {
  split: MentalLoadSplit | null;
  partnerName: string | null;
}) {
  const { split, partnerName } = props;
  const name = partnerName ?? t("head.carriers.partner");
  return (
    <View
      style={{
        marginTop: spacing.md,
        padding: spacing.md,
        backgroundColor: colors.surface,
      }}
    >
      <AppText accessibilityRole="header" style={{ fontWeight: "bold" }}>
        {t("head.split.title")}
      </AppText>
      {split === null ? (
        <AppText>{t("head.split.empty")}</AppText>
      ) : (
        <View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginVertical: spacing.sm,
            }}
          >
            <AppText>{t("head.split.me", { percent: split.me })}</AppText>
            <AppText>
              {t("head.split.partner", { name, percent: split.partner })}
            </AppText>
          </View>
          <SplitBar split={split} height={spacing.md} />
          <AppText style={{ color: colors.textMuted, marginTop: spacing.sm }}>
            {t("head.split.basis")}
          </AppText>
        </View>
      )}
    </View>
  );
}
