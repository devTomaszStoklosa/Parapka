import { render } from "@testing-library/react";

import { createProfileRepository } from "../data/profile-repository";
import { PlatformProvider, type Platform } from "../platform/context";
import { CycleScreen } from "./CycleScreen";
import { wireCycle } from "./wiring";

export { setup, useSodium } from "../chores/planner-test-support";

export const show = (platform: Platform) =>
  render(
    <PlatformProvider platform={platform}>
      <CycleScreen />
    </PlatformProvider>,
  );

/** The cycle service of the platform. */
export const cycleOf = (platform: Platform) => wireCycle(platform);

/** Saves a profile with the form; the other answers do not matter here. */
export async function saveForm(
  platform: Platform,
  form: "feminine" | "masculine" | "neutral",
) {
  await createProfileRepository(platform.database).save({
    name: "Ala",
    form,
    adultConfirmed: true,
    relationshipTenure: "1-3",
    hasChildren: false,
    childrenCount: 0,
    goals: [],
    otherGoalText: null,
    shareGoalsWithPartner: false,
    cycle: "yes",
    pinDecision: "skipped",
  });
}
