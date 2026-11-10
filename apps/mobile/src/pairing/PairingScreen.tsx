import { useEffect, useState } from "react";
import { View } from "react-native";

import { ConsentScreen } from "../consent/ConsentScreen";
import type { ConsentRepository } from "../consent/consent-repository";
import type { ProfileRepository } from "../data/profile-repository";
import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import type { PartnerProfileRepository } from "../sync/partner-profile-repository";
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
  | { kind: "consent" }
  | { kind: "paired" }
  | { kind: "unavailable" };

/** Reads the stored pair: what the person sees when the screen opens. */
function useInitialView(
  pairs: Pick<PairRepository, "current">,
  consent: Pick<ConsentRepository, "canSync">,
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
        if (pair?.state === "confirmed") {
          show({ kind: (await consent.canSync()) ? "paired" : "consent" });
        } else if (pair) show({ kind: "safety", code: await loadSafetyCode() });
        else show({ kind: "idle", rejected: false });
      })
      .catch(() => {
        show({ kind: "unavailable" });
      });
    return () => {
      active = false;
    };
  }, [pairs, consent, loadSafetyCode]);
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

/** The name of the partner once the first exchange brought it; none before. */
function PairedStatus({
  partner,
}: {
  partner: Pick<PartnerProfileRepository, "get">;
}) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void partner
      .get()
      .then((profile) => {
        if (active && profile) setName(profile.name);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [partner]);
  return (
    <AppText>
      {name === null ? t("pairing.paired") : t("pairing.pairedWith", { name })}
    </AppText>
  );
}

function Status({ kind }: { kind: "loading" | "unavailable" }) {
  if (kind === "loading") return null;
  return <AppText accessibilityRole="alert">{t("pairing.unavailable")}</AppText>;
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
      onConfirmed={go({ kind: "consent" })}
      onRejected={go({ kind: "idle", rejected: true })}
    />
  );
}

function ConsentStep({
  consent,
  profiles,
  go,
}: {
  consent: Pick<ConsentRepository, "save">;
  profiles: Pick<ProfileRepository, "get">;
  go: (next: PairingView) => () => void;
}) {
  return (
    <ConsentScreen
      consent={consent}
      profiles={profiles}
      onSaved={go({ kind: "paired" })}
    />
  );
}

interface PairingScreenProps {
  inviter: Inviter;
  acceptor: Pick<Acceptor, "accept">;
  pairs: Pick<PairRepository, "current">;
  consent: Pick<ConsentRepository, "canSync" | "save">;
  profiles: Pick<ProfileRepository, "get">;
  partner: Pick<PartnerProfileRepository, "get">;
  /** The code of a stored `pending-confirmation` pair. */
  loadSafetyCode: () => Promise<string>;
}

/** The Pair section of Settings: invite, compare the safety code, or the state of the pair. */
export function PairingScreen({
  inviter,
  acceptor,
  pairs,
  consent,
  profiles,
  partner,
  loadSafetyCode,
}: PairingScreenProps) {
  const [view, setView] = useInitialView(pairs, consent, loadSafetyCode);
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
    case "consent":
      return <ConsentStep consent={consent} profiles={profiles} go={go} />;
    case "paired":
      return <PairedStatus partner={partner} />;
    case "loading":
    case "unavailable":
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
