import { useEffect, useMemo, useState } from "react";

import type { Platform } from "../platform/context";
import { createPartnerProfileRepository } from "../sync/partner-profile-repository";
import { wireChores } from "../sync/wiring";
import type { StoredChore } from "./chore-repository";
import type { StoredCompletion } from "./completion-repository";

export interface PlannerData {
  readonly chores: readonly StoredChore[];
  readonly completions: readonly StoredCompletion[];
  readonly paired: boolean;
  /** The name from the profile of the partner; null until it arrives. */
  readonly partnerName: string | null;
}

/** The data of the planner: null while loading, "failed" when it did not load. */
export type PlannerState = PlannerData | "failed" | null;

/**
 * Loads the chores, their check-offs, the pair and the partner's name, and loads them again after
 * every change, also one made by the synchronization.
 */
export function usePlanner(platform: Platform): PlannerState {
  const { chores, completions, pairs } = useMemo(
    () => wireChores(platform),
    [platform],
  );
  const profile = useMemo(
    () => createPartnerProfileRepository(platform.database),
    [platform],
  );
  const [state, setState] = useState<PlannerState>(null);
  useEffect(() => {
    let active = true;
    let latest = 0;
    const load = () => {
      latest += 1;
      const issued = latest;
      const settle = (next: PlannerState) => {
        if (active && issued === latest) setState(next);
      };
      Promise.all([
        chores.list(),
        completions.list(),
        pairs.activePair(),
        profile.get(),
      ])
        .then(([list, done, pair, partner]) => {
          settle({
            chores: list,
            completions: done,
            paired: pair !== null,
            partnerName: partner?.name ?? null,
          });
        })
        .catch(() => {
          settle("failed");
        });
    };
    load();
    const unsubscribe = [chores, completions, pairs, profile].map((source) =>
      source.subscribe(load),
    );
    return () => {
      active = false;
      for (const stop of unsubscribe) stop();
    };
  }, [chores, completions, pairs, profile]);
  return state;
}
