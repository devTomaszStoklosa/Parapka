import { useCallback, useEffect, useMemo, useState } from "react";

import { wireConsent } from "../consent/wiring";
import type { Platform } from "../platform/context";
import { createPartnerProfileRepository } from "../sync/partner-profile-repository";
import type { CheckinInput, CheckinView } from "./checkin-service";
import { wireCheckin } from "./wiring";

export interface CheckinData {
  readonly view: CheckinView;
  /** Whether the consent of CHECKIN is on. */
  readonly shared: boolean;
  /** The name from the profile of the partner; null until it arrives. */
  readonly partnerName: string | null;
}

/** The data of the card: null while loading, "failed" when it did not load. */
export type CheckinState = CheckinData | "failed" | null;

type Checkin = ReturnType<typeof wireCheckin>["checkin"];
type Consent = ReturnType<typeof wireConsent>["consent"];
type Profile = ReturnType<typeof createPartnerProfileRepository>;

/** The state of the card, loaded again after every change of its sources. */
function useLoaded(checkin: Checkin, consent: Consent, profile: Profile) {
  const [state, setState] = useState<CheckinState>(null);
  useEffect(() => {
    let active = true;
    let latest = 0;
    const load = () => {
      latest += 1;
      const issued = latest;
      const settle = (next: CheckinState) => {
        if (active && issued === latest) setState(next);
      };
      Promise.all([
        checkin.current(),
        consent.isShared("CHECKIN"),
        profile.get(),
      ])
        .then(([view, shared, partner]) => {
          settle({ view, shared, partnerName: partner?.name ?? null });
        })
        .catch(() => {
          settle("failed");
        });
    };
    load();
    const stops = [
      checkin.subscribe(load),
      consent.onChange(load),
      profile.subscribe(load),
    ];
    return () => {
      active = false;
      for (const stop of stops) stop();
    };
  }, [checkin, consent, profile]);
  return state;
}

/**
 * Loads the check-in and the consent, and loads them again after every change,
 * also one made by the synchronization. `submit` tells whether it saved.
 */
export function useCheckin(platform: Platform) {
  const { checkin } = useMemo(() => wireCheckin(platform), [platform]);
  const { consent } = useMemo(() => wireConsent(platform), [platform]);
  const profile = useMemo(
    () => createPartnerProfileRepository(platform.database),
    [platform],
  );
  const state = useLoaded(checkin, consent, profile);
  const [failed, setFailed] = useState(false);

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
