import type { Profile } from "../data/profile";

/** Bump when the consent texts change, so a saved consent names the text it was given for. */
export const CONSENT_TEXT_VERSION = 1;

/** What a person decides to share with the partner; the name and form are always shared. */
export type ConsentCategory =
  | "CYCLE_HINTS"
  | "CHECKIN"
  | "SHARED_CHORES"
  | "SHARED_MENTAL_LOAD"
  | "ONBOARDING_GOALS";

export const CONSENT_CATEGORIES: readonly ConsentCategory[] = [
  "CYCLE_HINTS",
  "CHECKIN",
  "SHARED_CHORES",
  "SHARED_MENTAL_LOAD",
  "ONBOARDING_GOALS",
];

export type ConsentStates = Readonly<Record<ConsentCategory, boolean>>;

/** The part of the profile that decides what the consent offers. */
export type ConsentProfile = Pick<Profile, "cycle" | "shareGoalsWithPartner">;

/** Without a profile nothing about the cycle is offered and goals stay private. */
export const NO_PROFILE: ConsentProfile = {
  cycle: "no",
  shareGoalsWithPartner: false,
};

/** The categories the person can decide on: cycle hints only for a person with a cycle. */
export function visibleCategories(
  profile: ConsentProfile,
): readonly ConsentCategory[] {
  return CONSENT_CATEGORIES.filter(
    (category) => category !== "CYCLE_HINTS" || profile.cycle === "yes",
  );
}

/** Default states (spec 4.1, A11): only chores and mental load are on; goals follow onboarding. */
export function defaultConsent(profile: ConsentProfile): ConsentStates {
  return {
    CYCLE_HINTS: false,
    CHECKIN: false,
    SHARED_CHORES: true,
    SHARED_MENTAL_LOAD: true,
    ONBOARDING_GOALS: profile.shareGoalsWithPartner,
  };
}
