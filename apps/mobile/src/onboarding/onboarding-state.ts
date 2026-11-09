import {
  parseCycleSettings,
  UNKNOWN_CYCLE_SETTINGS,
  type CycleSettings,
} from "../data/cycle-settings";
import type {
  CycleAnswer,
  GoalId,
  GrammaticalForm,
  PinDecision,
  Profile,
  RelationshipTenure,
} from "../data/profile";

export type Step =
  | "name"
  | "form"
  | "adult"
  | "tenure"
  | "children"
  | "goals"
  | "cycle"
  | "disclaimer"
  | "cycleSetup"
  | "pin"
  | "device";

/** What the user entered so far; numbers stay text until the step is done. */
export interface Draft {
  readonly name: string;
  readonly form: GrammaticalForm | null;
  readonly adultConfirmed: boolean;
  readonly tenure: RelationshipTenure | null;
  readonly hasChildren: boolean | null;
  readonly childrenCount: string;
  readonly goals: readonly GoalId[];
  readonly otherGoalText: string;
  readonly shareGoalsWithPartner: boolean;
  readonly cycle: CycleAnswer | null;
  readonly disclaimerConfirmed: boolean;
  /** "Nie wiem" in the cycle setup: the defaults stay. */
  readonly cycleUnknown: boolean;
  readonly lastPeriodStart: string;
  readonly cycleLength: string;
  readonly periodLength: string;
  readonly pinDecision: PinDecision | null;
}

export interface OnboardingState {
  readonly step: Step;
  readonly draft: Draft;
}

export type OnboardingAction =
  | { type: "patch"; patch: Partial<Draft> }
  | { type: "next" }
  | { type: "back" };

export const MAX_CHILDREN = 20;

export const initialDraft: Draft = {
  name: "",
  form: null,
  adultConfirmed: false,
  tenure: null,
  hasChildren: null,
  childrenCount: "",
  goals: [],
  otherGoalText: "",
  shareGoalsWithPartner: false,
  cycle: null,
  disclaimerConfirmed: false,
  cycleUnknown: false,
  lastPeriodStart: "",
  cycleLength: "28",
  periodLength: "5",
  pinDecision: null,
};

export const initialOnboardingState: OnboardingState = {
  step: "name",
  draft: initialDraft,
};

const COMMON_START: readonly Step[] = [
  "name",
  "form",
  "adult",
  "tenure",
  "children",
  "goals",
  "cycle",
];
const CYCLE_STEPS: readonly Step[] = ["disclaimer", "cycleSetup"];
const COMMON_END: readonly Step[] = ["pin", "device"];

/** The steps of the path chosen so far; the cycle ones only for "mam cykl". */
export function stepsFor(draft: Draft): readonly Step[] {
  return [
    ...COMMON_START,
    ...(draft.cycle === "yes" ? CYCLE_STEPS : []),
    ...COMMON_END,
  ];
}

function parseCount(text: string): number | null {
  const value = Number(text);
  return text.trim() !== "" && Number.isInteger(value) ? value : null;
}

function childrenValid(draft: Draft): boolean {
  if (draft.hasChildren === null) return false;
  if (!draft.hasChildren) return true;
  const count = parseCount(draft.childrenCount);
  return count !== null && count >= 1 && count <= MAX_CHILDREN;
}

function cycleSettingsOf(draft: Draft): CycleSettings | null {
  if (draft.cycleUnknown) return UNKNOWN_CYCLE_SETTINGS;
  return parseCycleSettings({
    lastPeriodStart: draft.lastPeriodStart.trim(),
    cycleLength: parseCount(draft.cycleLength) ?? Number.NaN,
    periodLength: parseCount(draft.periodLength) ?? Number.NaN,
  });
}

const VALID: Record<Step, (draft: Draft) => boolean> = {
  name: (d) => d.name.trim() !== "",
  form: (d) => d.form !== null,
  // Without the confirmation of age there is no way on (FR-SEC-07).
  adult: (d) => d.adultConfirmed,
  tenure: (d) => d.tenure !== null,
  children: childrenValid,
  goals: () => true,
  cycle: (d) => d.cycle !== null,
  disclaimer: (d) => d.disclaimerConfirmed,
  cycleSetup: (d) => cycleSettingsOf(d) !== null,
  pin: (d) => d.pinDecision !== null,
  device: () => true,
};

export function canContinue(state: OnboardingState): boolean {
  return VALID[state.step](state.draft);
}

export function isLastStep(state: OnboardingState): boolean {
  return state.step === "device";
}

function move(state: OnboardingState, offset: 1 | -1): OnboardingState {
  const steps = stepsFor(state.draft);
  const next = steps[steps.indexOf(state.step) + offset];
  return next === undefined ? state : { ...state, step: next };
}

export function onboardingReducer(
  state: OnboardingState,
  action: OnboardingAction,
): OnboardingState {
  switch (action.type) {
    case "patch":
      return { ...state, draft: { ...state.draft, ...action.patch } };
    case "next":
      return canContinue(state) ? move(state, 1) : state;
    case "back":
      return move(state, -1);
  }
}

export interface OnboardingResult {
  readonly profile: Profile;
  /** Null unless the user has a cycle. */
  readonly cycleSettings: CycleSettings | null;
}

/** The profile and cycle settings from a finished draft; null when it is not valid. */
export function buildResult(draft: Draft): OnboardingResult | null {
  const { form, tenure, cycle, pinDecision } = draft;
  const complete = stepsFor(draft).every((step) => VALID[step](draft));
  if (!complete || !form || !tenure || !cycle || !pinDecision) return null;
  return {
    profile: {
      name: draft.name.trim(),
      form,
      adultConfirmed: true,
      relationshipTenure: tenure,
      hasChildren: draft.hasChildren === true,
      childrenCount: draft.hasChildren
        ? (parseCount(draft.childrenCount) ?? 0)
        : 0,
      goals: draft.goals,
      otherGoalText: draft.goals.includes("other")
        ? draft.otherGoalText.trim()
        : null,
      shareGoalsWithPartner: draft.shareGoalsWithPartner,
      cycle,
      pinDecision,
    },
    cycleSettings: cycle === "yes" ? cycleSettingsOf(draft) : null,
  };
}
