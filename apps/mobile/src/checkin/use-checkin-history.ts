import { useEffect, useMemo, useState } from "react";

import type { Platform } from "../platform/context";
import { createPartnerProfileRepository } from "../sync/partner-profile-repository";
import type { HistoryEntry } from "./checkin-history-model";
import { wireCheckin } from "./wiring";

/** The weeks that the history shows. */
export const HISTORY_WEEKS = 8;

export interface HistoryData {
  readonly entries: readonly HistoryEntry[];
  /** The name from the profile of the partner; null until it arrives. */
  readonly partnerName: string | null;
}

/** The history: null while loading, "failed" when it did not load. */
export type HistoryState = HistoryData | "failed" | null;

/** The history of the check-ins, loaded again after every change of its sources. */
export function useCheckinHistory(platform: Platform): HistoryState {
  const { checkin } = useMemo(() => wireCheckin(platform), [platform]);
  const profile = useMemo(
    () => createPartnerProfileRepository(platform.database),
    [platform],
  );
  const [state, setState] = useState<HistoryState>(null);
  useEffect(() => {
    let active = true;
    let latest = 0;
    const load = () => {
      latest += 1;
      const issued = latest;
      const settle = (next: HistoryState) => {
        if (active && issued === latest) setState(next);
      };
      Promise.all([checkin.history(HISTORY_WEEKS), profile.get()])
        .then(([entries, partner]) => {
          settle({ entries, partnerName: partner?.name ?? null });
        })
        .catch(() => {
          settle("failed");
        });
    };
    load();
    const stops = [checkin.subscribe(load), profile.subscribe(load)];
    return () => {
      active = false;
      for (const stop of stops) stop();
    };
  }, [checkin, profile]);
  return state;
}
