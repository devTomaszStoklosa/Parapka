import { expect, it } from "vitest";

import {
  CONSENT_CATEGORIES,
  defaultConsent,
  visibleCategories,
} from "./consent-model";

it("has the default states of the spec", () => {
  expect(
    defaultConsent({ cycle: "yes", shareGoalsWithPartner: false }),
  ).toEqual({
    CYCLE_HINTS: false,
    CHECKIN: false,
    SHARED_CHORES: true,
    SHARED_MENTAL_LOAD: true,
    ONBOARDING_GOALS: false,
  });
});

it("follows the onboarding switch for goals", () => {
  const states = defaultConsent({ cycle: "no", shareGoalsWithPartner: true });
  expect(states.ONBOARDING_GOALS).toBe(true);
});

it("offers cycle hints only to a person with a cycle", () => {
  expect(
    visibleCategories({ cycle: "yes", shareGoalsWithPartner: false }),
  ).toEqual(CONSENT_CATEGORIES);
  for (const cycle of ["no", "not-now"] as const) {
    const visible = visibleCategories({ cycle, shareGoalsWithPartner: false });
    expect(visible).not.toContain("CYCLE_HINTS");
    expect(visible).toHaveLength(CONSENT_CATEGORIES.length - 1);
  }
});
