import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { View } from "react-native";

import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";
import type { Inviter } from "./inviter";
import { QrCode } from "./QrCode";

/** How often the screen asks the relay whether the partner accepted. */
export const POLL_INTERVAL_MS = 3000;

type Failure = "alreadyPaired" | "expired" | "offline" | "invalid";

interface Waiting {
  kind: "waiting";
  link: string;
  expiresAt: number;
  offline: boolean;
  copy: "none" | "copied" | "failed";
}

type InviteView =
  { kind: "loading" } | Waiting | { kind: "failed"; failure: Failure };

type SetView = Dispatch<SetStateAction<InviteView>>;

function copyToClipboard(text: string): Promise<void> {
  // `navigator.clipboard` is missing outside secure contexts.
  const clipboard = globalThis.navigator.clipboard as Clipboard | undefined;
  return clipboard
    ? clipboard.writeText(text)
    : Promise.reject(new Error("No clipboard"));
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function patchWaiting(setView: SetView, patch: Partial<Waiting>) {
  setView((v) => (v.kind === "waiting" ? { ...v, ...patch } : v));
}

/** Creates an invitation again each time `attempt` changes. */
function useCreate(
  inviter: Pick<Inviter, "create">,
  attempt: number,
  setView: SetView,
) {
  useEffect(() => {
    let active = true;
    setView({ kind: "loading" });
    inviter.create().then(
      (result) => {
        if (!active) return;
        if (result.status === "created") {
          setView({ ...result, kind: "waiting", offline: false, copy: "none" });
        } else {
          const failure =
            result.status === "offline" ? "offline" : "alreadyPaired";
          setView({ kind: "failed", failure });
        }
      },
      () => {
        // The relay failed in a way the inviter does not map to a result.
        if (active) setView({ kind: "failed", failure: "offline" });
      },
    );
    return () => {
      active = false;
    };
  }, [inviter, attempt, setView]);
}

/** Polls while `link` is set; the timer dies with the screen. */
function usePoll(
  inviter: Pick<Inviter, "poll">,
  link: string | null,
  setView: SetView,
  onAccepted: (safetyCode: string) => void,
) {
  const accepted = useRef(onAccepted);
  accepted.current = onAccepted;
  useEffect(() => {
    if (link === null) return;
    let active = true;
    let busy = false;
    const poll = async () => {
      if (busy) return;
      busy = true;
      try {
        const result = await inviter.poll();
        if (!active) return;
        if (result.status === "accepted") accepted.current(result.safetyCode);
        else if (result.status === "waiting" || result.status === "offline") {
          patchWaiting(setView, { offline: result.status === "offline" });
        } else setView({ kind: "failed", failure: result.status });
      } catch {
        // Unmapped relay errors end the wait with a message and a retry.
        if (active) setView({ kind: "failed", failure: "offline" });
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [inviter, link, setView]);
}

function WaitingView({ view, onCopy }: { view: Waiting; onCopy: () => void }) {
  const time = formatTime(view.expiresAt);
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText>{t("pairing.invitation.instruction")}</AppText>
      <QrCode link={view.link} />
      <AppText>{t("pairing.invitation.expires", { time })}</AppText>
      <Button primary label={t("pairing.invitation.copy")} onPress={onCopy} />
      {view.copy === "copied" && (
        <AppText accessibilityRole="alert">
          {t("pairing.invitation.copied")}
        </AppText>
      )}
      {view.copy === "failed" && (
        <AppText accessibilityRole="alert">
          {t("pairing.invitation.copyFailed")}
        </AppText>
      )}
      <AppText>{t("pairing.invitation.waiting")}</AppText>
      {view.offline && (
        <AppText accessibilityRole="alert">
          {t("pairing.errors.offline")}
        </AppText>
      )}
    </View>
  );
}

function FailedView({
  failure,
  onRetry,
}: {
  failure: Failure;
  onRetry: () => void;
}) {
  return (
    <View>
      <AppText accessibilityRole="alert">
        {t(`pairing.errors.${failure}`)}
      </AppText>
      {failure !== "alreadyPaired" && (
        <Button primary label={t("pairing.newInvite")} onPress={onRetry} />
      )}
    </View>
  );
}

/**
 * Creates an invitation, shows its QR code and link, and asks the relay for
 * the answer while it is mounted.
 */
export function InviteScreen({
  inviter,
  onAccepted,
  onCancel,
  copyText = copyToClipboard,
}: {
  inviter: Pick<Inviter, "create" | "poll">;
  onAccepted: (safetyCode: string) => void;
  onCancel: () => void;
  copyText?: (text: string) => Promise<void>;
}) {
  const [view, setView] = useState<InviteView>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  useCreate(inviter, attempt, setView);
  const link = view.kind === "waiting" ? view.link : null;
  usePoll(inviter, link, setView, onAccepted);

  const copy = (text: string) => {
    copyText(text).then(
      () => {
        patchWaiting(setView, { copy: "copied" });
      },
      () => {
        patchWaiting(setView, { copy: "failed" });
      },
    );
  };

  return (
    <View>
      <AppText variant="title">{t("pairing.invitation.title")}</AppText>
      {view.kind === "waiting" && (
        <WaitingView
          view={view}
          onCopy={() => {
            copy(view.link);
          }}
        />
      )}
      {view.kind === "failed" && (
        <FailedView
          failure={view.failure}
          onRetry={() => {
            setAttempt((n) => n + 1);
          }}
        />
      )}
      <Button primary label={t("pairing.cancel")} onPress={onCancel} />
    </View>
  );
}
