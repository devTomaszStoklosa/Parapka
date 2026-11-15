import type { Assignment, Chore, ChoreRule } from "@parapka/domain";
import type { ContentChange } from "@parapka/protocol";
import { isAlive, type Change, type EntityState } from "@parapka/sync";

import {
  decodeAssignment,
  isChoreField,
  isValidField,
  type Devices,
  type StoredAssignment,
} from "./chore-codec";

/** A chore as the screens see it; the people are "me" and "partner". */
export interface StoredChore extends Chore {
  readonly assignment: Assignment;
  /** False for a chore that stays on this device (no pair, or the pair ended). */
  readonly shared: boolean;
  readonly note: string | null;
  /** The time of the reminder, `HH:MM`; nothing is scheduled yet. */
  readonly reminder: string | null;
  /** The thing to remember that this chore came from (FR-CHR-08), or null. */
  readonly linkedItemId: string | null;
}

export interface ChoreInput {
  readonly title: string;
  readonly rule: ChoreRule;
  readonly assignment: Assignment;
  readonly note?: string | null;
  readonly reminder?: string | null;
  readonly linkedItemId?: string | null;
}

/** Local changes that have no timestamp yet; the sync stamps them. */
export interface Pending {
  fields: Record<string, unknown>;
  life: "delete" | "restore" | null;
}

export interface ChoreRecord {
  shared: boolean;
  state: EntityState;
  pending: Pending;
}

/** The change of the partner without the fields that are not valid. */
export function sanitize(change: ContentChange): Change | null {
  if (change.op !== "upsert") return change as Change;
  const fields = Object.entries(change.fields).filter(
    ([name, field]) => isChoreField(name) && isValidField(name, field.value),
  );
  if (fields.length === 0) return null;
  return { ...change, fields: Object.fromEntries(fields) } as Change;
}

const isAliveNow = ({ state, pending }: ChoreRecord) =>
  pending.life === null ? isAlive(state) : pending.life === "restore";

/** The fields as they are now: the merged state with the pending edits on top. */
export function currentFields({ state, pending }: ChoreRecord) {
  const values: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(state.fields)) {
    values[name] = field.value;
  }
  return { ...values, ...pending.fields };
}

export function toChore(id: string, record: ChoreRecord, devices: Devices) {
  if (!isAliveNow(record)) return null;
  const { title, rule, assignment, note, reminder, linkedItemId } =
    currentFields(record);
  if (title === undefined || rule === undefined || assignment === undefined) {
    return null;
  }
  return {
    id,
    title,
    rule,
    assignment: decodeAssignment(assignment as StoredAssignment, devices),
    note: note ?? null,
    reminder: reminder ?? null,
    linkedItemId: linkedItemId ?? null,
    shared: record.shared,
  } as StoredChore;
}
