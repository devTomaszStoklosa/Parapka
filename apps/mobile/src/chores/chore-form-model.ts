import {
  validateAssignment,
  validateChoreRule,
  validateChoreTitle,
  type Assignment,
  type CalendarDate,
  type ChoreRule,
  type IsoWeekday,
  type Person,
} from "@parapka/domain";

import type { TranslationKey } from "../i18n";
import type { ChoreInput, StoredChore } from "./chore-repository";

export type RuleKind = ChoreRule["kind"];
export type Who = "me" | "partner" | "both" | "alternating" | "anyone";
export type Visibility = "shared" | "private";

/** What the form shows: texts as typed, so that a half-typed number stays. */
export interface FormState {
  readonly title: string;
  readonly kind: RuleKind;
  readonly interval: string;
  readonly startDate: string;
  readonly weekdays: readonly IsoWeekday[];
  readonly dayOfMonth: string;
  readonly dueDate: string;
  readonly who: Who;
  /** The start of an alternating assignment; the form does not ask for it. */
  readonly alternatingFirst: Person;
  readonly alternatingStart: string;
  readonly visibility: Visibility;
}

export const defaultFormState = (today: CalendarDate): FormState => ({
  title: "",
  kind: "occasional",
  interval: "2",
  startDate: today,
  weekdays: [],
  dayOfMonth: "1",
  dueDate: "",
  who: "me",
  alternatingFirst: "me",
  alternatingStart: today,
  visibility: "shared",
});

function whoOf(assignment: Assignment): Who {
  return assignment.kind === "person" ? assignment.person : assignment.kind;
}

/** The form fields of a rule; the fields of the other kinds stay as they are. */
function ruleFields(rule: ChoreRule): Partial<FormState> {
  switch (rule.kind) {
    case "daily":
      return {};
    case "everyNDays":
      return { interval: String(rule.interval), startDate: rule.startDate };
    case "weekdays":
      return { weekdays: rule.weekdays };
    case "monthly":
      return { dayOfMonth: String(rule.dayOfMonth) };
    case "occasional":
      return { dueDate: rule.dueDate ?? "" };
  }
}

/** The form of an existing chore. */
export function formStateOf(
  chore: StoredChore,
  today: CalendarDate,
): FormState {
  const { rule, assignment } = chore;
  return {
    ...defaultFormState(today),
    ...ruleFields(rule),
    title: chore.title,
    kind: rule.kind,
    who: whoOf(assignment),
    visibility: chore.shared ? "shared" : "private",
    ...(assignment.kind === "alternating"
      ? {
          alternatingFirst: assignment.firstPerson,
          alternatingStart: assignment.startDate,
        }
      : {}),
  };
}

function ruleOf(state: FormState): ChoreRule {
  switch (state.kind) {
    case "daily":
      return { kind: "daily" };
    case "everyNDays":
      return {
        kind: "everyNDays",
        interval: Number(state.interval),
        startDate: state.startDate,
      };
    case "weekdays":
      return { kind: "weekdays", weekdays: state.weekdays };
    case "monthly":
      return { kind: "monthly", dayOfMonth: Number(state.dayOfMonth) };
    case "occasional":
      return state.dueDate === ""
        ? { kind: "occasional" }
        : { kind: "occasional", dueDate: state.dueDate };
  }
}

function assignmentOf(state: FormState): Assignment {
  switch (state.who) {
    case "me":
    case "partner":
      return { kind: "person", person: state.who };
    case "alternating":
      return {
        kind: "alternating",
        firstPerson: state.alternatingFirst,
        startDate: state.alternatingStart,
      };
    case "both":
    case "anyone":
      return { kind: state.who };
  }
}

export type FormResult =
  { readonly input: ChoreInput } | { readonly error: TranslationKey };

function titleError(title: string): TranslationKey | null {
  try {
    validateChoreTitle(title);
    return null;
  } catch {
    return title.trim().length === 0
      ? "planner.form.errors.titleEmpty"
      : "planner.form.errors.titleTooLong";
  }
}

/** The chore of the form, or the key of the text that says what is wrong. */
export function toChoreInput(state: FormState): FormResult {
  const error = titleError(state.title);
  if (error !== null) return { error };
  const rule = ruleOf(state);
  const assignment = assignmentOf(state);
  try {
    validateChoreRule(rule);
    validateAssignment(assignment);
  } catch {
    return { error: "planner.form.errors.rule" };
  }
  return { input: { title: state.title, rule, assignment } };
}

/** The fields of `next` that differ from the chore: only they are saved. */
export function changedFields(
  chore: ChoreInput,
  next: ChoreInput,
): Partial<ChoreInput> {
  const patch: Partial<Record<keyof ChoreInput, unknown>> = {};
  for (const name of ["title", "rule", "assignment"] as const) {
    if (JSON.stringify(chore[name]) !== JSON.stringify(next[name])) {
      patch[name] = next[name];
    }
  }
  return patch as Partial<ChoreInput>;
}
