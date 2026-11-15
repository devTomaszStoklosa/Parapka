import { useEffect, useMemo, useState, type ReactNode } from "react";

import { wireConsent } from "../consent/wiring";
import { wireChores } from "../chores/wiring";
import { usePlatform } from "../platform/context";
import { SharePrivatePrompt } from "./SharePrivatePrompt";
import type { PrivateCandidates } from "./share-private";
import { wireSharePrivate } from "./wiring";

/** What to ask about, null when nothing is due; re-read when the pair or the consent changes. */
function useCandidates() {
  const platform = usePlatform();
  const service = useMemo(() => wireSharePrivate(platform), [platform]);
  const [candidates, setCandidates] = useState<PrivateCandidates | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => {
      service.candidates().then(
        (found) => {
          if (active) setCandidates(found);
        },
        () => {
          if (active) setCandidates(null);
        },
      );
    };
    load();
    const stops = [
      wireChores(platform).pairs.subscribe(load),
      wireConsent(platform).consent.onSaved(load),
    ];
    return () => {
      active = false;
      for (const stop of stops) stop();
    };
  }, [platform, service]);
  return { service, candidates, close: () => {
      setCandidates(null);
    },
  };
}

/**
 * Shows the question about handing private chores and things over to the
 * partner (FR-PAIR-04) once the pair and the consent are there; otherwise the
 * children. Once answered it never comes back.
 */
export function SharePrivateGate({ children }: { children: ReactNode }) {
  const { service, candidates, close } = useCandidates();
  if (candidates === null) return <>{children}</>;
  return (
    <SharePrivatePrompt
      candidates={candidates}
      onShare={async (choreIds, itemIds) => {
        await service.share(choreIds, itemIds);
        close();
      }}
      onSkip={async () => {
        await service.skip();
        close();
      }}
    />
  );
}
