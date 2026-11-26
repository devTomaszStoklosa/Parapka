import { base64urlEncode } from "@parapka/crypto";
import { useEffect, useMemo, useState } from "react";

import type { Platform } from "../platform/context";
import { wireChores } from "../sync/wiring";
import {
  DEFAULT_PERSON_TONES,
  personTones,
  type PersonTones,
} from "./person-tone";

/**
 * The colours of the two people of the pair, the same on both phones. Until the keys are read,
 * without a pair and when reading fails, it gives the defaults. It only reads.
 */
export function usePersonTones(platform: Platform): PersonTones {
  const { identity, pairs } = useMemo(() => wireChores(platform), [platform]);
  const [tones, setTones] = useState<PersonTones>(DEFAULT_PERSON_TONES);
  useEffect(() => {
    let active = true;
    let latest = 0;
    const load = () => {
      latest += 1;
      const issued = latest;
      const settle = (next: PersonTones) => {
        if (active && issued === latest) setTones(next);
      };
      Promise.all([identity.publicKeys(), pairs.activePair()])
        .then(([own, pair]) => {
          settle(
            own && pair
              ? personTones(base64urlEncode(own.signing), pair.signingPublicKey)
              : DEFAULT_PERSON_TONES,
          );
        })
        .catch(() => {
          settle(DEFAULT_PERSON_TONES);
        });
    };
    load();
    const stop = pairs.subscribe(load);
    return () => {
      active = false;
      stop();
    };
  }, [identity, pairs]);
  return tones;
}
