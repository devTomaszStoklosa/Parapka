import { useState } from "react";
import { View } from "react-native";

import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";

function useDisconnect(onDisconnect: () => Promise<void>, onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const confirm = () => {
    setBusy(true);
    setFailed(false);
    onDisconnect().then(onDone, () => {
      setBusy(false);
      setFailed(true);
    });
  };
  return {
    busy,
    failed,
    confirm,
    reset: () => {
      setFailed(false);
    },
  };
}

/** The "Disconnect" button with a confirmation that says what will happen. */
export function DisconnectControl({
  onDisconnect,
  onDone,
}: {
  onDisconnect: () => Promise<void>;
  onDone: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const { busy, failed, confirm, reset } = useDisconnect(onDisconnect, onDone);
  const cancel = () => {
    setConfirming(false);
    reset();
  };

  if (!confirming) {
    return (
      <Button
        label={t("pairing.disconnect.button")}
        onPress={() => {
          setConfirming(true);
        }}
      />
    );
  }
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText accessibilityRole="header">
        {t("pairing.disconnect.title")}
      </AppText>
      <AppText>{t("pairing.disconnect.consequences")}</AppText>
      {failed && (
        <AppText accessibilityRole="alert">
          {t("pairing.disconnect.failed")}
        </AppText>
      )}
      <Button
        primary
        disabled={busy}
        label={t("pairing.disconnect.confirm")}
        onPress={confirm}
      />
      <Button disabled={busy} label={t("pairing.cancel")} onPress={cancel} />
    </View>
  );
}
