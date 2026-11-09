import { describe, expect, it } from "vitest";

import {
  buildResult,
  canContinue,
  initialDraft,
  initialOnboardingState,
  onboardingReducer,
  stepsFor,
  type Draft,
  type OnboardingAction,
  type OnboardingState,
} from "./onboarding-state";

function run(
  actions: readonly OnboardingAction[],
  from: OnboardingState = initialOnboardingState,
): OnboardingState {
  return actions.reduce(onboardingReducer, from);
}

const patch = (p: Partial<Draft>): OnboardingAction => ({
  type: "patch",
  patch: p,
});
const next: OnboardingAction = { type: "next" };
const back: OnboardingAction = { type: "back" };

const answers: Partial<Draft> = {
  name: " Ola ",
  form: "feminine",
  adultConfirmed: true,
  tenure: "3-7",
  hasChildren: true,
  childrenCount: "2",
  goals: ["closeness", "other"],
  otherGoalText: " Podróż ",
  pinDecision: "skipped",
};

describe("path without a cycle", () => {
  it("goes through all the steps and builds the profile", () => {
    let state = run([patch({ ...answers, cycle: "no" })]);
    const visited = [state.step];
    for (let i = 0; i < 20 && state.step !== "device"; i++) {
      state = run([next], state);
      visited.push(state.step);
    }
    expect(visited).toEqual([
      "name",
      "form",
      "adult",
      "tenure",
      "children",
      "goals",
      "cycle",
      "pin",
      "device",
    ]);
    expect(buildResult(state.draft)).toEqual({
      profile: {
        name: "Ola",
        form: "feminine",
        adultConfirmed: true,
        relationshipTenure: "3-7",
        hasChildren: true,
        childrenCount: 2,
        goals: ["closeness", "other"],
        otherGoalText: "Podróż",
        shareGoalsWithPartner: false,
        cycle: "no",
        pinDecision: "skipped",
      },
      cycleSettings: null,
    });
  });
});

describe("path with a cycle", () => {
  const cycleDraft: Partial<Draft> = {
    ...answers,
    cycle: "yes",
    disclaimerConfirmed: true,
    lastPeriodStart: "2026-10-01",
    cycleLength: "30",
    periodLength: "4",
  };

  it("adds the disclaimer and the setup", () => {
    expect(stepsFor({ ...initialDraft, cycle: "yes" })).toContain("disclaimer");
    expect(stepsFor({ ...initialDraft, cycle: "not-now" })).not.toContain(
      "cycleSetup",
    );
  });

  it("saves the cycle settings", () => {
    const result = buildResult({ ...initialDraft, ...cycleDraft });
    expect(result?.profile.cycle).toBe("yes");
    expect(result?.cycleSettings).toEqual({
      unknown: false,
      lastPeriodStart: "2026-10-01",
      cycleLength: 30,
      periodLength: 4,
    });
  });

  it("keeps the defaults for 'nie wiem'", () => {
    const result = buildResult({
      ...initialDraft,
      ...cycleDraft,
      cycleUnknown: true,
      cycleLength: "99",
    });
    expect(result?.cycleSettings).toEqual({
      unknown: true,
      lastPeriodStart: null,
      cycleLength: 28,
      periodLength: 5,
    });
  });

  it("does not leave the disclaimer without a confirmation", () => {
    const state = run([patch({ ...cycleDraft, disclaimerConfirmed: false })]);
    const atDisclaimer = { ...state, step: "disclaimer" as const };
    expect(canContinue(atDisclaimer)).toBe(false);
    expect(run([next], atDisclaimer).step).toBe("disclaimer");
  });

  it.each(["20", "46", "x", ""])("rejects cycle length %j", (cycleLength) => {
    const state = run([patch({ ...cycleDraft, cycleLength })]);
    expect(canContinue({ ...state, step: "cycleSetup" })).toBe(false);
    expect(buildResult(state.draft)).toBeNull();
  });

  it.each(["1", "11", "2.5"])("rejects period length %j", (periodLength) => {
    const state = run([patch({ ...cycleDraft, periodLength })]);
    expect(canContinue({ ...state, step: "cycleSetup" })).toBe(false);
  });
});

describe("gates", () => {
  it("does not pass the age step without the confirmation", () => {
    const state = run([
      patch({ name: "Ola", form: "neutral" }),
      next,
      next,
      next,
    ]);
    expect(state.step).toBe("adult");
    expect(canContinue(state)).toBe(false);
  });

  it("builds nothing without the age confirmation", () => {
    expect(
      buildResult({
        ...initialDraft,
        ...answers,
        cycle: "no",
        adultConfirmed: false,
      }),
    ).toBeNull();
  });

  it("needs a name, a form, a tenure and an answer about children", () => {
    expect(run([next]).step).toBe("name");
    expect(run([patch({ name: "  " }), next]).step).toBe("name");
    expect(run([patch({ name: "Ola" }), next]).step).toBe("form");
    const atChildren = { ...initialOnboardingState, step: "children" as const };
    expect(canContinue(atChildren)).toBe(false);
    expect(canContinue(run([patch({ hasChildren: true })], atChildren))).toBe(
      false,
    );
    expect(
      canContinue(
        run([patch({ hasChildren: true, childrenCount: "0" })], atChildren),
      ),
    ).toBe(false);
    expect(canContinue(run([patch({ hasChildren: false })], atChildren))).toBe(
      true,
    );
  });

  it("shares goals with the partner only when asked", () => {
    expect(initialDraft.shareGoalsWithPartner).toBe(false);
    const result = buildResult({
      ...initialDraft,
      ...answers,
      cycle: "not-now",
      shareGoalsWithPartner: true,
    });
    expect(result?.profile.shareGoalsWithPartner).toBe(true);
    expect(result?.cycleSettings).toBeNull();
  });
});

describe("back", () => {
  it("returns to the previous step and stays at the first", () => {
    const state = run([patch({ name: "Ola" }), next, back]);
    expect(state.step).toBe("name");
    expect(run([back]).step).toBe("name");
  });

  it("skips the cycle steps when the answer changes", () => {
    const atCycle: OnboardingState = {
      step: "cycle",
      draft: { ...initialDraft, ...answers, cycle: "yes" },
    };
    const state = run([next, back, patch({ cycle: "no" }), next], atCycle);
    expect(state.step).toBe("pin");
  });
});
