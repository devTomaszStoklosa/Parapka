import { View } from "react-native";

import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";

/** Both people compare the code; synchronization waits for the confirmation (FR-PAIR-02). */
export function SafetyCodeScreen(props: {
  code: string;
  onSame: () => void;
  onDifferent: () => void;
}) {
  return (
    <View style={{ gap: spacing.md }}>
      <AppText variant="title">{t("pairing.safety.title")}</AppText>
      <AppText>{t("pairing.safety.instruction")}</AppText>
      <AppText
        variant="title"
        accessibilityRole="text"
        style={{ letterSpacing: 4, textAlign: "center" }}
      >
        {props.code}
      </AppText>
      <Button primary label={t("pairing.safety.same")} onPress={props.onSame} />
      <Button
        label={t("pairing.safety.different")}
        onPress={props.onDifferent}
      />
    </View>
  );
}
