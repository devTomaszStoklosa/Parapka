import { View } from "react-native";

import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { usePlatform } from "../platform/context";
import { AppText } from "../ui/AppText";
import { PairingScreen } from "./PairingScreen";
import { usePairingWiring } from "./wiring";

/** The Pair section with the real dependencies of the platform. */
export function PairingEntry() {
  const { wiring, retry } = usePairingWiring(usePlatform());

  if (wiring === "loading") return null;
  if (wiring === null) {
    return (
      <View>
        <AppText accessibilityRole="alert">{t("pairing.unavailable")}</AppText>
        <Button primary label={t("pairing.retry")} onPress={retry} />
      </View>
    );
  }
  return <PairingScreen {...wiring} />;
}
