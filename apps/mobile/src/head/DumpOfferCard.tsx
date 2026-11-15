import { View } from "react-native";

import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { colors, spacing } from "../ui/theme";

/** The invitation to the brain dump in the first week of a pair. */
export function DumpOfferCard(props: {
  onStart: () => void;
  onDismiss: () => void;
}) {
  return (
    <View
      style={{
        gap: spacing.sm,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <AppText>{t("head.dump.offer")}</AppText>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <Button primary label={t("head.dump.start")} onPress={props.onStart} />
        <Button label={t("head.dump.later")} onPress={props.onDismiss} />
      </View>
    </View>
  );
}
