/** Grammatical form the app uses to address the user (FR-ONB-01). */
export type GrammaticalForm = "feminine" | "masculine" | "neutral";

export interface ProfileGoal {
  readonly text: string;
  /** Whether the goal is shown to the partner (FR-ONB-02). */
  readonly shareWithPartner: boolean;
}

/** Profile collected during onboarding (FR-ONB-01, FR-ONB-02). */
export interface Profile {
  readonly name: string;
  readonly form: GrammaticalForm;
  readonly adultConfirmed: boolean;
  /** Length of the relationship in months. */
  readonly relationshipMonths: number;
  readonly hasChildren: boolean;
  readonly goals: readonly ProfileGoal[];
  /** The user has a menstrual cycle ("mam cykl"). */
  readonly hasCycle: boolean;
}
