import { View } from "react-native";

import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { usePlatform } from "../platform/context";
import { AppText } from "../ui/AppText";
import { colors, spacing } from "../ui/theme";
import { AcceptScreen } from "./AcceptScreen";
import { usePairingWiring } from "./wiring";

/** The screen of an opened invitation link, with the real dependencies of the platform. */
export function AcceptEntry({
  text,
  onDone,
}: {
  text: string;
  onDone: () => void;
}) {
  const { wiring, retry } = usePairingWiring(usePlatform());

  let content = null;
  if (wiring === null) {
    content = (
      <View style={{ gap: spacing.sm }}>
        <AppText accessibilityRole="alert">{t("pairing.unavailable")}</AppText>
        <Button primary label={t("pairing.retry")} onPress={retry} />
        <Button label={t("pairing.close")} onPress={onDone} />
      </View>
    );
  } else if (wiring !== "loading") {
    content = (
      <AcceptScreen acceptor={wiring.acceptor} text={text} onDone={onDone} />
    );
  }
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        padding: spacing.lg,
        backgroundColor: colors.background,
      }}
    >
      {content}
    </View>
  );
}
