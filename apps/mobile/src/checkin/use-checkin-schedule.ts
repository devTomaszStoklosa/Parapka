import { useCallback, useEffect, useState } from "react";
import type { CheckinSchedule } from "@parapka/domain";

import type { PairRepository } from "../pairing/pair-repository";
import type { ScheduleRepository } from "./schedule-repository";

export interface ScheduleSource {
  schedule: Pick<ScheduleRepository, "get" | "set" | "subscribe">;
  pairs: Pick<PairRepository, "activePair" | "subscribe">;
}

/**
 * The schedule of the pair, or null without a pair or when it cannot be read.
 * It reloads after a change of the schedule (also from the partner) or the pair.
 */
export function useCheckinSchedule({ schedule, pairs }: ScheduleSource) {
  const [current, setCurrent] = useState<CheckinSchedule | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () => {
      void pairs
        .activePair()
        .then((pair) => (pair ? schedule.get() : null))
        .catch(() => null)
        .then((loaded) => {
          if (active) setCurrent(loaded);
        });
    };
    load();
    const stops = [schedule.subscribe(load), pairs.subscribe(load)];
    return () => {
      active = false;
      for (const stop of stops) stop();
    };
  }, [schedule, pairs]);

  /** Changes one field of the schedule as it is now. */
  const change = useCallback(
    (patch: Partial<CheckinSchedule>) => {
      if (!current) return;
      setFailed(false);
      schedule.set({ ...current, ...patch }).catch(() => {
        setFailed(true);
      });
    },
    [schedule, current],
  );

  return { current, failed, change };
}
