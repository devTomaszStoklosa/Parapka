import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";
import { qrMatrix } from "./invitation-link";
import type { ActiveInvitation, Inviter } from "./inviter";
import { QrView } from "./QrView";

/** How often the screen asks the relay whether the partner accepted. */
export const POLL_INTERVAL_MS = 3000;

type Ended = "expired" | "invalid";

/**
 * Asks the relay about the invitation until the partner accepts or it ends.
 * It lives in an effect, so it runs only while the screen is open.
 */
function usePolling(
  inviter: Inviter,
  invitation: ActiveInvitation,
  onAccepted: () => void,
): Ended | null {
  const [ended, setEnded] = useState<Ended | null>(null);
  useEffect(() => {
    if (ended !== null) return;
    let active = true;
    let busy = false;
    const tick = () => {
      if (busy) return;
      busy = true;
      inviter
        .poll(invitation)
        .then((outcome) => {
          if (!active) return;
          if (outcome.status === "accepted") onAccepted();
          else if (outcome.status !== "waiting") setEnded(outcome.status);
        })
        .catch(() => {
          // A failed poll is tried again on the next tick.
        })
        .finally(() => {
          busy = false;
        });
    };
    const timer = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [inviter, invitation, ended, onAccepted]);
  return ended;
}

function Waiting(props: { invitation: ActiveInvitation; onClose: () => void }) {
  const { invitation } = props;
  const [copied, setCopied] = useState(false);
  const matrix = useMemo(() => qrMatrix(invitation.link), [invitation.link]);
  const validUntil = new Date(invitation.expiresAtMs).toLocaleString("pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
  });
  return (
    <View style={{ gap: spacing.md }}>
      <AppText>{t("pairing.invitation.hint")}</AppText>
      <QrView
        matrix={matrix}
        accessibilityLabel={t("pairing.invitation.qrLabel")}
      />
      <AppText>
        {t("pairing.invitation.validUntil", { time: validUntil })}
      </AppText>
      <Button
        primary
        label={t("pairing.invitation.copy")}
        onPress={() => {
          void navigator.clipboard.writeText(invitation.link).then(() => {
            setCopied(true);
          });
        }}
      />
      {copied && (
        <AppText accessibilityRole="alert">
          {t("pairing.invitation.copied")}
        </AppText>
      )}
      <AppText>{t("pairing.invitation.waiting")}</AppText>
      <Button label={t("pairing.invitation.cancel")} onPress={props.onClose} />
    </View>
  );
}

function EndedView(props: {
  ended: Ended;
  onRenew: () => void;
  onClose: () => void;
}) {
  return (
    <View style={{ gap: spacing.md }}>
      <AppText accessibilityRole="alert">
        {t(
          props.ended === "expired"
            ? "pairing.invitation.expired"
            : "pairing.invitation.invalid",
        )}
      </AppText>
      <Button
        primary
        label={t("pairing.invitation.renew")}
        onPress={props.onRenew}
      />
      <Button label={t("pairing.invitation.cancel")} onPress={props.onClose} />
    </View>
  );
}

/** Shows the QR code and the link of an invitation and waits for the partner. */
export function InviteScreen(props: {
  inviter: Inviter;
  invitation: ActiveInvitation;
  onAccepted: () => void;
  onRenew: () => void;
  onClose: () => void;
}) {
  const ended = usePolling(props.inviter, props.invitation, props.onAccepted);
  if (ended !== null) {
    return (
      <EndedView
        ended={ended}
        onRenew={props.onRenew}
        onClose={props.onClose}
      />
    );
  }
  return <Waiting invitation={props.invitation} onClose={props.onClose} />;
}
