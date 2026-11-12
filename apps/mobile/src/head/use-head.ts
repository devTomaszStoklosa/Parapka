import { useEffect, useMemo, useState } from "react";

import { wireChores } from "../chores/wiring";
import type { Platform } from "../platform/context";
import { createPartnerProfileRepository } from "../sync/partner-profile-repository";
import type { HeadItem } from "./head-service";
import { wireHead } from "./wiring";

export interface HeadData {
  readonly items: readonly HeadItem[];
  readonly paired: boolean;
  /** The name from the profile of the partner; null until it arrives. */
  readonly partnerName: string | null;
}

/** The data of the screen: null while loading, "failed" when it did not load. */
export type HeadState = HeadData | "failed" | null;

/**
 * Loads the items with their carriers, the pair and the partner's name, and
 * loads them again after every change, also one made by the synchronization.
 */
export function useHead(platform: Platform): HeadState {
  const { head } = useMemo(() => wireHead(platform), [platform]);
  const { pairs } = useMemo(() => wireChores(platform), [platform]);
  const profile = useMemo(
    () => createPartnerProfileRepository(platform.database),
    [platform],
  );
  const [state, setState] = useState<HeadState>(null);
  useEffect(() => {
    let active = true;
    let latest = 0;
    const load = () => {
      latest += 1;
      const issued = latest;
      const settle = (next: HeadState) => {
        if (active && issued === latest) setState(next);
      };
      Promise.all([head.list(), pairs.activePair(), profile.get()])
        .then(([items, pair, partner]) => {
          settle({
            items,
            paired: pair !== null,
            partnerName: partner?.name ?? null,
          });
        })
        .catch(() => {
          settle("failed");
        });
    };
    load();
    const unsubscribe = [head, pairs, profile].map((source) =>
      source.subscribe(load),
    );
    return () => {
      active = false;
      for (const stop of unsubscribe) stop();
    };
  }, [head, pairs, profile]);
  return state;
}
