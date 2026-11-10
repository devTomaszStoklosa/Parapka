import { useEffect, useState } from "react";
import { View } from "react-native";

import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { InviteScreen } from "./InviteScreen";
import type { Acceptor } from "./acceptor";
import type { Inviter } from "./inviter";
import type { PairRepository } from "./pair-repository";
import { PasteInvitation } from "./PasteInvitation";
import { SafetyCodeScreen } from "./SafetyCodeScreen";

type PairingView =
  | { kind: "loading" }
  | { kind: "idle"; rejected: boolean }
  | { kind: "invite" }
  | { kind: "safety"; code: string }
  | { kind: "paired" }
  | { kind: "unavailable" };

/** Reads the stored pair: what the person sees when the screen opens. */
function useInitialView(
  pairs: Pick<PairRepository, "current">,
  loadSafetyCode: () => Promise<string>,
): [PairingView, (view: PairingView) => void] {
  const [view, setView] = useState<PairingView>({ kind: "loading" });
  useEffect(() => {
    let active = true;
    const show = (view: PairingView) => {
      if (active) setView(view);
    };
    void pairs
      .current()
      .then(async (pair) => {
        if (pair?.state === "confirmed") show({ kind: "paired" });
        else if (pair) show({ kind: "safety", code: await loadSafetyCode() });
        else show({ kind: "idle", rejected: false });
      })
      .catch(() => {
        show({ kind: "unavailable" });
      });
    return () => {
      active = false;
    };
  }, [pairs, loadSafetyCode]);
  return [view, setView];
}

function IdleView({
  rejected,
  acceptor,
  onInvite,
  onAccepted,
}: {
  rejected: boolean;
  acceptor: Pick<Acceptor, "accept">;
  onInvite: () => void;
  onAccepted: (safetyCode: string) => void;
}) {
  return (
    <View>
      {rejected && (
        <AppText accessibilityRole="alert">{t("pairing.rejected")}</AppText>
      )}
      <Button primary label={t("pairing.invite")} onPress={onInvite} />
      <PasteInvitation acceptor={acceptor} onAccepted={onAccepted} />
    </View>
  );
}

function Status({ kind }: { kind: "loading" | "unavailable" | "paired" }) {
  if (kind === "loading") return null;
  return kind === "paired" ? (
    <AppText>{t("pairing.paired")}</AppText>
  ) : (
    <AppText accessibilityRole="alert">{t("pairing.unavailable")}</AppText>
  );
}

function SafetyStep({
  code,
  inviter,
  go,
}: {
  code: string;
  inviter: Inviter;
  go: (next: PairingView) => () => void;
}) {
  return (
    <SafetyCodeScreen
      code={code}
      inviter={inviter}
      onConfirmed={go({ kind: "paired" })}
      onRejected={go({ kind: "idle", rejected: true })}
    />
  );
}

/** The Pair section of Settings: invite, compare the safety code, or the state of the pair. */
export function PairingScreen({
  inviter,
  acceptor,
  pairs,
  loadSafetyCode,
}: {
  inviter: Inviter;
  acceptor: Pick<Acceptor, "accept">;
  pairs: Pick<PairRepository, "current">;
  /** The code of a stored `pending-confirmation` pair. */
  loadSafetyCode: () => Promise<string>;
}) {
  const [view, setView] = useInitialView(pairs, loadSafetyCode);
  const go = (next: PairingView) => () => {
    setView(next);
  };
  const showCode = (code: string) => {
    go({ kind: "safety", code })();
  };
  switch (view.kind) {
    case "invite":
      return (
        <InviteScreen
          inviter={inviter}
          onAccepted={showCode}
          onCancel={go({ kind: "idle", rejected: false })}
        />
      );
    case "safety":
      return <SafetyStep code={view.code} inviter={inviter} go={go} />;
    case "loading":
    case "unavailable":
    case "paired":
      return <Status kind={view.kind} />;
    case "idle":
      return (
        <IdleView
          rejected={view.rejected}
          acceptor={acceptor}
          onInvite={go({ kind: "invite" })}
          onAccepted={showCode}
        />
      );
  }
}
