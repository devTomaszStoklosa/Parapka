import { useMemo } from "react";

import { createProfileRepository } from "../data/profile-repository";
import type { Platform } from "../platform/context";
import { createConsentRepository } from "./consent-repository";

/** The consent and profile repositories over the database of the platform. */
export function wireConsent(platform: Platform) {
  const { database, clock } = platform;
  const profiles = createProfileRepository(database);
  const consent = createConsentRepository({ database, clock, profiles });
  return { consent, profiles };
}

export function useConsentWiring(platform: Platform) {
  return useMemo(() => wireConsent(platform), [platform]);
}
