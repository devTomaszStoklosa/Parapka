import { useCallback, useEffect, useMemo, useState } from "react";

import type { HintReaction } from "../cycle/hint-reaction-repository";
import type { ReceivedHint } from "../cycle/received-hint-repository";
import { wireCycleHints } from "../cycle/wiring";
import type { Platform } from "../platform/context";
import { createPartnerProfileRepository } from "../sync/partner-profile-repository";

export interface PartnerHintData {
  /** The hint for today when it is scheduled; null for every other case. */
  readonly hint: ReceivedHint | null;
  readonly reaction: HintReaction | null;
  /** The name from the profile of the partner; null until it arrives. */
  readonly partnerName: string | null;
}

/** The data of the card: null while loading or without any hint, "failed" when it did not load. */
export type PartnerHintState = PartnerHintData | "failed" | null;

type Hints = ReturnType<typeof wireCycleHints>;
type Profile = ReturnType<typeof createPartnerProfileRepository>;

async function read(hints: Hints, profile: Profile): Promise<PartnerHintState> {
  const { received, reactions } = hints;
  const [today, history, partner] = await Promise.all([
    received.today(),
    received.history(),
    profile.get(),
  ]);
  if (today === null && history.length === 0) return null;
  const hint = today?.status === "scheduled" ? today : null;
  return {
    hint,
    reaction: hint === null ? null : await reactions.get(hint.id),
    partnerName: partner?.name ?? null,
  };
}

/** The state of the card, loaded again after every change of its sources. */
function useLoaded(hints: Hints, profile: Profile) {
  const [state, setState] = useState<PartnerHintState>(null);
  useEffect(() => {
    let active = true;
    let latest = 0;
    const load = () => {
      latest += 1;
      const issued = latest;
      const settle = (next: PartnerHintState) => {
        if (active && issued === latest) setState(next);
      };
      read(hints, profile)
        .then(settle)
        .catch(() => {
          settle("failed");
        });
    };
    load();
    const stops = [
      hints.received.subscribe(load),
      hints.reactions.subscribe(load),
      profile.subscribe(load),
    ];
    return () => {
      active = false;
      for (const stop of stops) stop();
    };
  }, [hints, profile]);
  return state;
}

/**
 * The hint of the partner for today with the reaction of this phone, loaded
 * again after every change, also one made by the synchronization. The
 * reaction stays on this phone (FR-CYC-11).
 */
export function usePartnerHint(platform: Platform) {
  const hints = useMemo(() => wireCycleHints(platform), [platform]);
  const profile = useMemo(
    () => createPartnerProfileRepository(platform.database),
    [platform],
  );
  const state = useLoaded(hints, profile);
  const [failed, setFailed] = useState(false);

  const react = useCallback(
    async (hintId: string, reaction: HintReaction) => {
      setFailed(false);
      try {
        await hints.reactions.set(hintId, reaction);
      } catch {
        setFailed(true);
      }
    },
    [hints],
  );

  return { state, failed, react };
}
