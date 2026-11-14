import { useState } from "react";
import { View } from "react-native";

import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";

/** FR-CYC-15: the message "not a medical tool", one touch away on the panel. */
export function CycleDisclaimer() {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
      <Button
        label={t("cycle.disclaimer.button")}
        expanded={open}
        onPress={() => {
          setOpen(!open);
        }}
      />
      {open ? <AppText>{t("onboarding.disclaimer.text")}</AppText> : null}
    </View>
  );
}
