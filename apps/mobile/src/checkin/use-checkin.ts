import { useCallback, useEffect, useMemo, useState } from "react";

import { wireConsent } from "../consent/wiring";
import type { Platform } from "../platform/context";
import type { CheckinInput, CheckinView } from "./checkin-service";
import { wireCheckin } from "./wiring";

export interface CheckinData {
  readonly view: CheckinView;
  /** Whether the consent of CHECKIN is on. */
  readonly shared: boolean;
}

/** The data of the card: null while loading, "failed" when it did not load. */
export type CheckinState = CheckinData | "failed" | null;

/**
 * Loads the check-in and the consent, and loads them again after every change,
 * also one made by the synchronization. `submit` tells whether it saved.
 */
export function useCheckin(platform: Platform) {
  const { checkin } = useMemo(() => wireCheckin(platform), [platform]);
  const { consent } = useMemo(() => wireConsent(platform), [platform]);
  const [state, setState] = useState<CheckinState>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let latest = 0;
    const load = () => {
      latest += 1;
      const issued = latest;
      const settle = (next: CheckinState) => {
        if (active && issued === latest) setState(next);
      };
      Promise.all([checkin.current(), consent.isShared("CHECKIN")])
        .then(([view, shared]) => {
          settle({ view, shared });
        })
        .catch(() => {
          settle("failed");
        });
    };
    load();
    const stops = [checkin.subscribe(load), consent.onChange(load)];
    return () => {
      active = false;
      for (const stop of stops) stop();
    };
  }, [checkin, consent]);

  const submit = useCallback(
    async (input: CheckinInput) => {
      setFailed(false);
      try {
        await checkin.submit(input);
        return true;
      } catch {
        setFailed(true);
        return false;
      }
    },
    [checkin],
  );

  return { state, failed, submit };
}
