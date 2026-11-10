import { useMemo } from "react";

import { createProfileRepository } from "../data/profile-repository";
import type { Platform } from "../platform/context";
import { createConsentRepository } from "./consent-repository";

const wired = new WeakMap<Platform, ReturnType<typeof build>>();

function build(platform: Platform) {
  const { database, clock } = platform;
  const profiles = createProfileRepository(database);
  const consent = createConsentRepository({ database, clock, profiles });
  return { consent, profiles };
}

/**
 * The consent and profile repositories over the database of the platform. One
 * pair per platform, so the listeners of changes see every save.
 */
export function wireConsent(platform: Platform) {
  let repositories = wired.get(platform);
  if (!repositories) {
    repositories = build(platform);
    wired.set(platform, repositories);
  }
  return repositories;
}

export function useConsentWiring(platform: Platform) {
  return useMemo(() => wireConsent(platform), [platform]);
}
