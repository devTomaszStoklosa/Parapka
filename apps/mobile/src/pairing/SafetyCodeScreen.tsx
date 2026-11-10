import { useState } from "react";
import { View } from "react-native";

import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";
import type { Inviter } from "./inviter";

/** The six digits both phones show; the person compares them with the partner. */
export function SafetyCodeScreen({
  code,
  inviter,
  onConfirmed,
  onRejected,
}: {
  code: string;
  inviter: Pick<Inviter, "confirm" | "reject">;
  onConfirmed: () => void;
  onRejected: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const run = (action: () => Promise<void>, done: () => void) => () => {
    setFailed(false);
    action().then(done, () => {
      setFailed(true);
    });
  };
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="title">{t("pairing.safety.title")}</AppText>
      <AppText>{t("pairing.safety.instruction")}</AppText>
      <AppText
        variant="title"
        accessibilityLabel={code.split("").join(" ")}
        style={{ marginVertical: spacing.md }}
      >
        {code}
      </AppText>
      <Button
        primary
        label={t("pairing.safety.same")}
        onPress={run(() => inviter.confirm(), onConfirmed)}
      />
      <Button
        primary
        label={t("pairing.safety.different")}
        onPress={run(() => inviter.reject(), onRejected)}
      />
      {failed && (
        <AppText accessibilityRole="alert">{t("pairing.unavailable")}</AppText>
      )}
    </View>
  );
}
