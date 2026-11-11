import { useEffect, useMemo, useState } from "react";

import type { Platform } from "../platform/context";
import { wireChores } from "../sync/wiring";
import type { StoredChore } from "./chore-repository";
import type { StoredCompletion } from "./completion-repository";

export interface PlannerData {
  readonly chores: readonly StoredChore[];
  readonly completions: readonly StoredCompletion[];
  readonly paired: boolean;
}

/** The data of the planner: null while loading, "failed" when it did not load. */
export type PlannerState = PlannerData | "failed" | null;

/**
 * Loads the chores, their check-offs and the pair, and loads them again after
 * every change, also one made by the synchronization.
 */
export function usePlanner(platform: Platform): PlannerState {
  const { chores, completions, pairs } = useMemo(
    () => wireChores(platform),
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
      Promise.all([chores.list(), completions.list(), pairs.activePair()])
        .then(([list, done, pair]) => {
          settle({ chores: list, completions: done, paired: pair !== null });
        })
        .catch(() => {
          settle("failed");
        });
    };
    load();
    const unsubscribe = [chores, completions, pairs].map((source) =>
      source.subscribe(load),
    );
    return () => {
      active = false;
      for (const stop of unsubscribe) stop();
    };
  }, [chores, completions, pairs]);
  return state;
}
