/** Grammatical form the app uses to address the user (FR-ONB-01). */
export type GrammaticalForm = "feminine" | "masculine" | "neutral";

/** Length of the relationship in years (FR-ONB-01). */
export type RelationshipTenure = "<1" | "1-3" | "3-7" | "7-15" | "15+";

export const RELATIONSHIP_TENURES: readonly RelationshipTenure[] = [
  "<1",
  "1-3",
  "3-7",
  "7-15",
  "15+",
];

/** Values of the goals step; `other` comes with a free text. */
export type GoalId =
  | "time-together"
  | "conversation"
  | "chores"
  | "closeness"
  | "passion"
  | "fewer-arguments"
  | "other";

export const GOAL_IDS: readonly GoalId[] = [
  "time-together",
  "conversation",
  "chores",
  "closeness",
  "passion",
  "fewer-arguments",
  "other",
];

/** The answer to "do I have a cycle" (FR-ONB-03). */
export type CycleAnswer = "yes" | "no" | "not-now";

/** What the user decided about the PIN lock (FR-ONB-04). */
export type PinDecision = "set" | "skipped";

/** Profile collected during onboarding (FR-ONB-01, FR-ONB-02). */
export interface Profile {
  readonly name: string;
  readonly form: GrammaticalForm;
  readonly adultConfirmed: boolean;
  readonly relationshipTenure: RelationshipTenure;
  readonly hasChildren: boolean;
  /** Number of children, 0 when there are none. */
  readonly childrenCount: number;
  readonly goals: readonly GoalId[];
  /** The text of the `other` goal, null when it is not chosen. */
  readonly otherGoalText: string | null;
  /** One switch for all goals; off by default (FR-ONB-02). */
  readonly shareGoalsWithPartner: boolean;
  readonly cycle: CycleAnswer;
  readonly pinDecision: PinDecision;
}
