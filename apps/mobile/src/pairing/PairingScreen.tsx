import { useEffect, useState } from "react";
import { View } from "react-native";

import { ConsentScreen } from "../consent/ConsentScreen";
import type { ConsentRepository } from "../consent/consent-repository";
import type { ProfileRepository } from "../data/profile-repository";
import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import type { PartnerProfileRepository } from "../sync/partner-profile-repository";
import type { PauseRepository } from "../sync/pause-repository";
import { PauseToggle } from "../sync/PauseToggle";
import { AppText } from "../ui/AppText";
import { DisconnectControl } from "./DisconnectControl";
import type { DisconnectRepository } from "./disconnect-repository";
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
  | { kind: "ended" }
  | { kind: "unavailable" };

/** Reads the stored pair: what the person sees when the screen opens. */
function useInitialView(
  pairs: Pick<PairRepository, "current">,
  consent: Pick<ConsentRepository, "canSync">,
  disconnect: Pick<DisconnectRepository, "state">,
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
        else if ((await disconnect.state()) === "by-partner") {
          show({ kind: "ended" });
        } else show({ kind: "idle", rejected: false });
      })
      .catch(() => {
        show({ kind: "unavailable" });
      });
    return () => {
      active = false;
    };
  }, [pairs, consent, disconnect, loadSafetyCode]);
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
  partner: Pick<PartnerProfileRepository, "get" | "subscribe">;
}) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void partner
        .get()
        .then((profile) => {
          if (active && profile) setName(profile.name);
        })
        .catch(() => undefined);
    };
    refresh();
    const unsubscribe = partner.subscribe(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [partner]);
  return (
    <AppText>
      {name === null ? t("pairing.paired") : t("pairing.pairedWith", { name })}
    </AppText>
  );
}

/** Tells, without blame, that the partner or the relay ended the pair. */
function EndedView({ onAcknowledge }: { onAcknowledge: () => void }) {
  return (
    <View>
      <AppText accessibilityRole="alert">{t("pairing.disconnected")}</AppText>
      <Button primary label={t("pairing.ok")} onPress={onAcknowledge} />
    </View>
  );
}

function PairedView(props: {
  partner: PairingScreenProps["partner"];
  pause: PairingScreenProps["pause"];
  onDisconnect: () => Promise<void>;
  onDone: () => void;
}) {
  return (
    <View>
      <PairedStatus partner={props.partner} />
      <PauseToggle pause={props.pause} />
      <DisconnectControl
        onDisconnect={props.onDisconnect}
        onDone={props.onDone}
      />
    </View>
  );
}

function Status({ kind }: { kind: "loading" | "unavailable" }) {
  if (kind === "loading") return null;
  return (
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
  partner: Pick<PartnerProfileRepository, "get" | "subscribe">;
  /** The code of a stored `pending-confirmation` pair. */
  loadSafetyCode: () => Promise<string>;
  disconnect: Pick<DisconnectRepository, "state" | "acknowledge" | "subscribe">;
  /** Ends the pair on this device and tells the relay. */
  onDisconnect: () => Promise<void>;
  pause: Pick<PauseRepository, "isPaused" | "setPaused" | "subscribe">;
}

/** Shows the message once the partner ends the pair while the screen is open. */
function useEndedByPartner(
  disconnect: Pick<DisconnectRepository, "state" | "subscribe">,
  show: (view: PairingView) => void,
) {
  useEffect(() => {
    let active = true;
    const unsubscribe = disconnect.subscribe(() => {
      void disconnect
        .state()
        .then((state) => {
          if (active && state === "by-partner") show({ kind: "ended" });
        })
        .catch(() => undefined);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [disconnect, show]);
}

/** The Pair section of Settings: invite, compare the safety code, or the state of the pair. */
export function PairingScreen(props: PairingScreenProps) {
  const { pairs, consent, disconnect, loadSafetyCode } = props;
  const [view, setView] = useInitialView(
    pairs,
    consent,
    disconnect,
    loadSafetyCode,
  );
  useEndedByPartner(disconnect, setView);
  return <PairingBody {...props} view={view} setView={setView} />;
}

function PairingBody({
  view,
  setView,
  ...props
}: PairingScreenProps & {
  view: PairingView;
  setView: (view: PairingView) => void;
}) {
  const { inviter, acceptor, consent, profiles, disconnect } = props;
  const go = (next: PairingView) => () => {
    setView(next);
  };
  const idle = go({ kind: "idle", rejected: false });
  const acknowledge = () => {
    void disconnect.acknowledge().catch(() => undefined);
    idle();
  };
  const showCode = (code: string) => {
    go({ kind: "safety", code })();
  };
  switch (view.kind) {
    case "invite":
      return (
        <InviteScreen inviter={inviter} onAccepted={showCode} onCancel={idle} />
      );
    case "safety":
      return <SafetyStep code={view.code} inviter={inviter} go={go} />;
    case "consent":
      return <ConsentStep consent={consent} profiles={profiles} go={go} />;
    case "paired":
      return <PairedView {...props} onDone={idle} />;
    case "ended":
      return <EndedView onAcknowledge={acknowledge} />;
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
