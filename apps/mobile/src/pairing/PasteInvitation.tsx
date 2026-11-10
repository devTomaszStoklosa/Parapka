import { useState } from "react";
import { View } from "react-native";

import { t, type TranslationKey } from "../i18n";
import { Button, Field } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";
import type { Acceptor, AcceptResult } from "./acceptor";

/** The message of a failed `accept`: no technical details. */
export function acceptFailureMessage(
  status: Exclude<AcceptResult["status"], "accepted">,
): TranslationKey {
  switch (status) {
    case "invalid":
      return "pairing.errors.invalidInvitation";
    case "already-paired":
      return "pairing.errors.alreadyPaired";
    case "expired":
      return "pairing.errors.expired";
    case "inviter-paired":
      return "pairing.errors.inviterPaired";
    case "offline":
      return "pairing.errors.offline";
  }
}

/** A field for the invitation link and the button that accepts it. */
export function PasteInvitation({
  acceptor,
  onAccepted,
}: {
  acceptor: Pick<Acceptor, "accept">;
  onAccepted: (safetyCode: string) => void;
}) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState<TranslationKey | null>(null);
  const [busy, setBusy] = useState(false);

  const connect = () => {
    setBusy(true);
    setMessage(null);
    acceptor.accept(text.trim()).then(
      (result) => {
        setBusy(false);
        if (result.status === "accepted") onAccepted(result.safetyCode);
        else setMessage(acceptFailureMessage(result.status));
      },
      () => {
        setBusy(false);
        setMessage("pairing.unavailable");
      },
    );
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <Field label={t("pairing.paste.label")} value={text} onChange={setText} />
      <Button
        primary
        label={t("pairing.paste.connect")}
        disabled={busy || text.trim() === ""}
        onPress={connect}
      />
      {message && <AppText accessibilityRole="alert">{t(message)}</AppText>}
    </View>
  );
}
