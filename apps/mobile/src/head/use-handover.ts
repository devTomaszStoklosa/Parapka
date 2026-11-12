import { useEffect, useMemo, useState } from "react";

import type { Platform } from "../platform/context";
import type { HandoverView } from "./handover-service";
import { wireHead } from "./wiring";

/** The pending requests: of the partner to me and mine. */
export interface HandoverData {
  readonly incoming: readonly HandoverView[];
  readonly outgoing: readonly HandoverView[];
}

const NONE: HandoverData = { incoming: [], outgoing: [] };

/**
 * Loads the pending requests and loads them again after every change, also one
 * made by the synchronization. Requests that did not load count as none.
 */
export function useHandover(platform: Platform): HandoverData {
  const { handover } = useMemo(() => wireHead(platform), [platform]);
  const [data, setData] = useState<HandoverData>(NONE);
  useEffect(() => {
    let active = true;
    let latest = 0;
    const load = () => {
      latest += 1;
      const issued = latest;
      const settle = (next: HandoverData) => {
        if (active && issued === latest) setData(next);
      };
      Promise.all([handover.incoming(), handover.outgoing()])
        .then(([incoming, outgoing]) => {
          settle({ incoming, outgoing });
        })
        .catch(() => {
          settle(NONE);
        });
    };
    load();
    const stop = handover.subscribe(load);
    return () => {
      active = false;
      stop();
    };
  }, [handover]);
  return data;
}
