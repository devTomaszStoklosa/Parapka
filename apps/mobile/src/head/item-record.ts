import type {
  MentalLoadCategory,
  MentalLoadStatus,
  MentalLoadWeight,
} from "@parapka/domain";
import type { ContentChange } from "@parapka/protocol";
import { isAlive, type Change, type EntityState } from "@parapka/sync";

import { isItemField, isValidField } from "./item-codec";

/** A thing to remember as the screens see it. */
export interface StoredItem {
  readonly id: string;
  readonly title: string;
  readonly category: MentalLoadCategory;
  readonly weight: MentalLoadWeight;
  /** `YYYY-MM-DD` or null. */
  readonly dueDate: string | null;
  readonly status: MentalLoadStatus;
  /** When it was marked as done (ms), null while it is open. */
  readonly doneAt: number | null;
  /** The chore made from this item (FR-MNT-08), or null. */
  readonly linkedChoreId: string | null;
  /** False for an item that stays on this device (no pair, or the pair ended). */
  readonly shared: boolean;
}

export interface ItemInput {
  readonly title: string;
  readonly category?: MentalLoadCategory;
  readonly weight?: number;
  readonly dueDate?: string | null;
  readonly linkedChoreId?: string | null;
}

/** Local changes that have no timestamp yet; the sync stamps them. */
export interface Pending {
  fields: Record<string, unknown>;
  life: "delete" | "restore" | null;
}

export interface ItemRecord {
  shared: boolean;
  state: EntityState;
  pending: Pending;
}

/** The change of the partner without the fields that are not valid. */
export function sanitize(change: ContentChange): Change | null {
  if (change.op !== "upsert") return change as Change;
  const fields = Object.entries(change.fields).filter(
    ([name, field]) => isItemField(name) && isValidField(name, field.value),
  );
  if (fields.length === 0) return null;
  return { ...change, fields: Object.fromEntries(fields) } as Change;
}

const isAliveNow = ({ state, pending }: ItemRecord) =>
  pending.life === null ? isAlive(state) : pending.life === "restore";

/** The fields as they are now: the merged state with the pending edits on top. */
export function currentFields({ state, pending }: ItemRecord) {
  const values: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(state.fields)) {
    values[name] = field.value;
  }
  return { ...values, ...pending.fields };
}

export function toItem(id: string, record: ItemRecord): StoredItem | null {
  if (!isAliveNow(record)) return null;
  const fields = currentFields(record);
  if (fields.title === undefined) return null;
  return {
    id,
    title: fields.title,
    category: fields.category ?? "other",
    weight: fields.weight ?? 2,
    dueDate: fields.dueDate ?? null,
    status: fields.status ?? "open",
    doneAt: fields.doneAt ?? null,
    linkedChoreId: fields.linkedChoreId ?? null,
    shared: record.shared,
  } as StoredItem;
}
