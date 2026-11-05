export const PHASES = [
  "menstruation",
  "follicular",
  "periovulatory",
  "luteal",
  "premenstrual",
] as const;
export type Phase = (typeof PHASES)[number];

export const HINT_CATEGORIES = [
  "relief",
  "tenderness",
  "attention",
  "space",
  "appreciation",
] as const;
export type HintCategory = (typeof HINT_CATEGORIES)[number];

export const GRAMMATICAL_FORMS = ["feminine", "masculine", "neutral"] as const;
export type GrammaticalForm = (typeof GRAMMATICAL_FORMS)[number];

export const REVIEW_STATUSES = ["unreviewed", "reviewed"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export type FormTexts = Record<GrammaticalForm, string>;

export interface PhaseDescription {
  phase: Phase;
  text: FormTexts;
  review: ReviewStatus;
}

export interface HintTemplate {
  id: string;
  category: HintCategory;
  text: FormTexts;
  review: ReviewStatus;
}

export interface EngineRule {
  id: string;
  // The meaning of the condition belongs to the hint engine, not to the library.
  when: Record<string, unknown>;
  categories: HintCategory[];
  priority: number;
}

export interface ContentFile<T> {
  contentVersion: number;
  entries: T[];
}

export interface ValidationError {
  file: string;
  /** Identifies the entry, for example `entries[2] ("x")`; empty for the whole file. */
  entry: string;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: ContentFile<T> }
  | { ok: false; errors: ValidationError[] };
