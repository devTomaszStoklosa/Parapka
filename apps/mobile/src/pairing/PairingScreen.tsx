import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView } from "react-native";

import { createIdentity } from "../identity/identity";
import { t, type TranslationKey } from "../i18n";
import { createRelayClient } from "../net/relay-client";
import { Button } from "../onboarding/controls";
import { usePlatform } from "../platform/context";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";
import { InviteScreen } from "./InviteScreen";
import { createInviter, type ActiveInvitation } from "./inviter";
import { createPairRepository } from "./pair-repository";
import { SafetyCodeScreen } from "./SafetyCodeScreen";

type Notice = "alreadyPaired" | "offline" | "error" | "rejected";

type View =
  | { readonly kind: "loading" }
  | {
      readonly kind: "home";
      readonly paired: boolean;
      readonly notice: Notice | null;
    }
  | { readonly kind: "invite"; readonly invitation: ActiveInvitation }
  | { readonly kind: "safety"; readonly code: string };

const NOTICES: Record<Notice, TranslationKey> = {
  alreadyPaired: "pairing.alreadyPaired",
  offline: "pairing.offline",
  error: "pairing.error",
  rejected: "pairing.rejected",
};

function usePairing() {
  const { sodium, keyStore, database, clock, sha256, relayUrl, appUrl } =
    usePlatform();
  return useMemo(() => {
    const relay = (credentials?: {
      deviceId: string;
      signingPrivateKey: Uint8Array;
    }) =>
      createRelayClient({
        baseUrl: relayUrl,
        fetch: (url, init) => fetch(url, init),
        sodium,
        sha256,
        ...(credentials ? { credentials } : {}),
      });
    const identity = createIdentity({
      sodium,
      keyStore,
      database,
      relay,
    });
    const pairs = createPairRepository(database, keyStore);
    const inviter = createInviter({
      sodium,
      keyStore,
      clock,
      identity,
      pairs,
      relay,
      appUrl: appUrl ?? "",
    });
    return { pairs, inviter };
  }, [sodium, keyStore, database, clock, sha256, relayUrl, appUrl]);
}

function Home(props: {
  paired: boolean;
  notice: Notice | null;
  onInvite: () => void;
}) {
  return (
    <>
      {props.paired && <AppText>{t("pairing.paired")}</AppText>}
      {props.notice !== null && (
        <AppText accessibilityRole="alert">{t(NOTICES[props.notice])}</AppText>
      )}
      <Button primary label={t("pairing.invite")} onPress={props.onInvite} />
    </>
  );
}

function useFlow() {
  const { pairs, inviter } = usePairing();
  const [view, setView] = useState<View>({ kind: "loading" });

  const home = useCallback(
    async (notice: Notice | null = null) => {
      const record = await pairs.get();
      const code = await inviter.pendingSafetyCode();
      if (code !== null) setView({ kind: "safety", code });
      else setView({ kind: "home", paired: record !== null, notice });
    },
    [pairs, inviter],
  );

  useEffect(() => {
    void home();
  }, [home]);

  const invite = async () => {
    try {
      const outcome = await inviter.start();
      if (outcome.status === "created") {
        setView({ kind: "invite", invitation: outcome.invitation });
      } else {
        await home(outcome.status);
      }
    } catch {
      await home("error");
    }
  };
  return { pairs, inviter, view, home, invite };
}

/** Settings → Pair: invite a partner, then compare the safety code. */
export function PairingScreen() {
  const { pairs, inviter, view, home, invite } = useFlow();
  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
    >
      <AppText variant="title" accessibilityRole="header">
        {t("screens.settings.title")}
      </AppText>
      <AppText>{t("pairing.title")}</AppText>
      {view.kind === "home" && (
        <Home
          paired={view.paired}
          notice={view.notice}
          onInvite={() => void invite()}
        />
      )}
      {view.kind === "invite" && (
        <InviteScreen
          key={view.invitation.invitationId}
          inviter={inviter}
          invitation={view.invitation}
          onAccepted={() => void home()}
          onRenew={() => void invite()}
          onClose={() => void home()}
        />
      )}
      {view.kind === "safety" && (
        <SafetyCodeScreen
          code={view.code}
          onSame={() => void pairs.confirm().then(() => home())}
          onDifferent={() => void pairs.reject().then(() => home("rejected"))}
        />
      )}
    </ScrollView>
  );
}
