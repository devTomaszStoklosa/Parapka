/** Grammatical form used in the app's texts (A15). */
export type GrammaticalForm = "feminine" | "masculine" | "neutral";

/** Length of the relationship (FR-ONB-01). */
export type RelationshipDuration =
  "under1" | "1to3" | "3to7" | "7to15" | "over15";

export type CycleStatus = "yes" | "no" | "notNow";

export type GoalKind =
  | "timeTogether"
  | "conversation"
  | "duties"
  | "closeness"
  | "passion"
  | "fewerArguments"
  | "other";

export interface Goal {
  kind: GoalKind;
  /** Free text, only for `other`. */
  text?: string;
}

export interface Children {
  has: boolean;
  count: number;
}

/** Answers of the onboarding (FR-ONB-01, FR-ONB-02). */
export interface Profile {
  name: string;
  grammaticalForm: GrammaticalForm;
  /** Confirmation of being an adult (FR-SEC-07). */
  adultConfirmed: boolean;
  relationshipDuration: RelationshipDuration;
  children: Children;
  goals: Goal[];
  /** Whether the partner sees the goals; private by default (FR-ONB-02). */
  showGoalsToPartner: boolean;
  cycle: CycleStatus;
}
