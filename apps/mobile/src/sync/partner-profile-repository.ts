import { compareHlc, parseHlc } from "@parapka/sync";

import { changeChannel } from "../data/change-listeners";
import type { JsonValue, LocalDatabase } from "../data/local-database";
import {
  GOAL_IDS,
  type GoalId,
  type GrammaticalForm,
  type Profile,
} from "../data/profile";

// Apart from the own profile, which lives in the collection "profile".
const COLLECTION = "partner-profile";
const ID = "current";

const FORMS: readonly GrammaticalForm[] = ["feminine", "masculine", "neutral"];

/** What the partner shares of their profile; goals stay null while not shared. */
export interface PartnerProfile {
  readonly name: string;
  readonly form: GrammaticalForm;
  readonly goals: readonly GoalId[] | null;
}

export type PartnerField = "name" | "form" | "goals" | "otherGoalText";

export interface StampedField {
  readonly value: unknown;
  readonly hlc: string;
}

interface Stored {
  readonly fields: Readonly<Record<string, StampedField>>;
}

export interface PartnerProfileRepository {
  /** The profile of the partner, or null before the name and form arrive. */
  get(): Promise<PartnerProfile | null>;
  /** Keeps the newer value of every field; a repeat or an older change is harmless. */
  merge(fields: Readonly<Record<string, StampedField>>): Promise<void>;
  /** Calls the listener after every write of the profile; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

const isGoals = (value: unknown): value is GoalId[] =>
  Array.isArray(value) &&
  value.every((goal) => GOAL_IDS.includes(goal as GoalId));

const VALID: Record<PartnerField, (value: unknown) => boolean> = {
  name: (value) => typeof value === "string" && value !== "",
  form: (value) => FORMS.includes(value as GrammaticalForm),
  // A null withdraws the value: the partner turned the category off.
  goals: (value) => value === null || isGoals(value),
  otherGoalText: (value) => value === null,
};

export const isPartnerField = (name: string): name is PartnerField =>
  Object.hasOwn(VALID, name);

/** The fields of the own profile that go to the partner. */
export function profileFields(
  profile: Pick<Profile, "name" | "form" | "goals">,
  withGoals: boolean,
): Partial<Record<PartnerField, unknown>> {
  return withGoals
    ? { name: profile.name, form: profile.form, goals: profile.goals }
    : { name: profile.name, form: profile.form };
}

export function createPartnerProfileRepository(
  db: LocalDatabase,
): PartnerProfileRepository {
  const read = async (): Promise<Stored> =>
    ((await db.get(COLLECTION, ID)) as unknown as Stored | null) ?? {
      fields: {},
    };
  const changes = changeChannel(db, COLLECTION);
  return {
    subscribe: changes.subscribe,
    get: async () => {
      const { name, form, goals } = (await read()).fields;
      if (!name || !form) return null;
      return {
        name: name.value as string,
        form: form.value as GrammaticalForm,
        goals: (goals?.value as GoalId[] | undefined) ?? null,
      };
    },
    merge: async (incoming) => {
      const fields: Record<string, StampedField> = { ...(await read()).fields };
      for (const [name, field] of Object.entries(incoming)) {
        if (!isPartnerField(name) || !VALID[name](field.value)) continue;
        const known = fields[name];
        if (
          known &&
          compareHlc(parseHlc(field.hlc), parseHlc(known.hlc)) <= 0
        ) {
          continue;
        }
        fields[name] = field;
      }
      await db.put(COLLECTION, ID, { fields } as unknown as JsonValue);
      changes.notify();
    },
  };
}
