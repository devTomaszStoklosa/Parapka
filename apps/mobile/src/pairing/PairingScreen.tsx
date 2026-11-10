import { useEffect, useState } from "react";
import { View } from "react-native";

import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { InviteScreen } from "./InviteScreen";
import type { Inviter } from "./inviter";
import type { PairRepository } from "./pair-repository";
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
  setView: (view: PairingView) => void,
) {
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
  }, [pairs, loadSafetyCode, setView]);
}

function IdleView({
  rejected,
  onInvite,
}: {
  rejected: boolean;
  onInvite: () => void;
}) {
  return (
    <View>
      {rejected && (
        <AppText accessibilityRole="alert">{t("pairing.rejected")}</AppText>
      )}
      <Button primary label={t("pairing.invite")} onPress={onInvite} />
    </View>
  );
}

/** The Pair section of Settings: invite, compare the safety code, or the state of the pair. */
export function PairingScreen({
  inviter,
  pairs,
  loadSafetyCode,
}: {
  inviter: Inviter;
  pairs: Pick<PairRepository, "current">;
  /** The code of a stored `pending-confirmation` pair. */
  loadSafetyCode: () => Promise<string>;
}) {
  const [view, setView] = useState<PairingView>({ kind: "loading" });
  useInitialView(pairs, loadSafetyCode, setView);

  const go = (next: PairingView) => () => {
    setView(next);
  };

  switch (view.kind) {
    case "loading":
      return null;
    case "invite":
      return (
        <InviteScreen
          inviter={inviter}
          onAccepted={(code) => {
            setView({ kind: "safety", code });
          }}
          onCancel={go({ kind: "idle", rejected: false })}
        />
      );
    case "safety":
      return (
        <SafetyCodeScreen
          code={view.code}
          inviter={inviter}
          onConfirmed={go({ kind: "paired" })}
          onRejected={go({ kind: "idle", rejected: true })}
        />
      );
    case "unavailable":
      return (
        <AppText accessibilityRole="alert">{t("pairing.unavailable")}</AppText>
      );
    case "paired":
      return <AppText>{t("pairing.paired")}</AppText>;
    case "idle":
      return (
        <IdleView rejected={view.rejected} onInvite={go({ kind: "invite" })} />
      );
  }
}
