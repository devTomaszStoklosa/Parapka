import { useEffect, useMemo, useState } from "react";

import { wireChores } from "../chores/wiring";
import type { Platform } from "../platform/context";
import { createDumpOffer } from "./dump-offer";

/**
 * Whether the invitation to the brain dump is due, re-read when the pair
 * changes. A failed read or write hides it.
 */
export function useDumpOffer(platform: Platform) {
  const offer = useMemo(
    () =>
      createDumpOffer({
        database: platform.database,
        pairs: wireChores(platform).pairs,
        clock: platform.clock,
      }),
    [platform],
  );
  const [due, setDue] = useState(false);
  useEffect(() => {
    let active = true;
    const load = () => {
      offer.due().then(
        (next) => {
          if (active) setDue(next);
        },
        () => {
          if (active) setDue(false);
        },
      );
    };
    load();
    const stop = wireChores(platform).pairs.subscribe(load);
    return () => {
      active = false;
      stop();
    };
  }, [platform, offer]);
  return {
    due,
    dismiss: () => {
      setDue(false);
      offer.dismiss().catch(() => undefined);
    },
  };
}
