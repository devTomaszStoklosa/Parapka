import { useEffect, useMemo, useState } from "react";

import { usePlatform } from "../platform/context";
import type { PairRepository } from "../pairing/pair-repository";
import { createPauseRepository } from "../sync/pause-repository";
import { PauseToggle } from "../sync/PauseToggle";
import { wireChores } from "../sync/wiring";

/** Whether a confirmed pair exists; false while loading or when it cannot be read. */
function useHasPair(pairs: Pick<PairRepository, "activePair" | "subscribe">) {
  const [has, setHas] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () => {
      void pairs
        .activePair()
        .then((pair) => pair !== null)
        .catch(() => false)
        .then((value) => {
          if (active) setHas(value);
        });
    };
    load();
    const stop = pairs.subscribe(load);
    return () => {
      active = false;
      stop();
    };
  }, [pairs]);
  return has;
}

/** The switch of the pause on the "Today" tab (FR-PAIR-06); only with a confirmed pair. */
export function TodayPause() {
  const platform = usePlatform();
  const { pairs, pause } = useMemo(
    () => ({
      pairs: wireChores(platform).pairs,
      pause: createPauseRepository(platform.database),
    }),
    [platform],
  );
  return useHasPair(pairs) ? <PauseToggle pause={pause} /> : null;
}
