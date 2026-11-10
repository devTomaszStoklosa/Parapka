import { useEffect, useState } from "react";
import { View } from "react-native";

import { ConsentScreen } from "../consent/ConsentScreen";
import type { ConsentRepository } from "../consent/consent-repository";
import type { ProfileRepository } from "../data/profile-repository";
import { t, type TranslationKey } from "../i18n";
import { Button } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";
import type { Acceptor } from "./acceptor";
import { acceptFailureMessage } from "./PasteInvitation";
import { SafetyCodeScreen } from "./SafetyCodeScreen";

type AcceptView =
  | { kind: "loading" }
  | { kind: "safety"; code: string }
  | { kind: "consent" }
  | { kind: "failed"; message: TranslationKey };

function useAccept(
  acceptor: Acceptor,
  text: string,
): [AcceptView, (next: AcceptView) => void] {
  const [view, setView] = useState<AcceptView>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    const show = (next: AcceptView) => {
      if (active) setView(next);
    };
    acceptor.accept(text).then(
      (result) => {
        show(
          result.status === "accepted"
            ? { kind: "safety", code: result.safetyCode }
            : { kind: "failed", message: acceptFailureMessage(result.status) },
        );
      },
      () => {
        show({ kind: "failed", message: "pairing.unavailable" });
      },
    );
    return () => {
      active = false;
    };
  }, [acceptor, text]);
  return [view, setView];
}

/**
 * Accepts the invitation text the app was opened with and shows the safety
 * code; `onDone` runs when the person leaves the screen.
 */
export function AcceptScreen({
  acceptor,
  consent,
  profiles,
  text,
  onDone,
}: {
  acceptor: Acceptor;
  consent: Pick<ConsentRepository, "save">;
  profiles: Pick<ProfileRepository, "get">;
  text: string;
  onDone: () => void;
}) {
  const [view, setView] = useAccept(acceptor, text);

  switch (view.kind) {
    case "loading":
      return null;
    case "safety":
      return (
        <SafetyCodeScreen
          code={view.code}
          inviter={acceptor}
          onConfirmed={() => {
            setView({ kind: "consent" });
          }}
          onRejected={onDone}
        />
      );
    case "consent":
      return (
        <ConsentScreen consent={consent} profiles={profiles} onSaved={onDone} />
      );
    case "failed":
      return (
        <View style={{ gap: spacing.sm }}>
          <AppText accessibilityRole="alert">{t(view.message)}</AppText>
          <Button primary label={t("pairing.close")} onPress={onDone} />
        </View>
      );
  }
}
