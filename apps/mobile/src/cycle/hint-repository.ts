import {
  fromDayNumber,
  toDayNumber,
  type CalendarDate,
  type GeneratedHint,
  type HintCategory,
} from "@parapka/domain";
import { emptyEntityState, type EntityState } from "@parapka/sync";

import { changeChannel } from "../data/change-listeners";
import type { JsonValue, LocalDatabase } from "../data/local-database";

export const HINTS = "cycle-hints";
// The merge of `@parapka/sync` knows the entities it lists; the state of a
// hint is merged as a "Chore" and only the envelope carries "Hint".
const MERGE_ENTITY = "Chore";

/** The fields of a hint of the own person; one per day (spec §3 `Hint`). */
export interface StoredHint {
  readonly forDate: CalendarDate;
  readonly text: string;
  readonly category: HintCategory;
  readonly templateId: string;
  readonly contentVersion: number;
  readonly status: "scheduled";
}

interface Pending {
  fields: StoredHint | null;
  life: "delete" | "restore" | null;
}

/** The shape that `createRecordSync` takes, so the sync only adds a handler. */
export interface HintRecord {
  shared: boolean;
  state: EntityState;
  pending: Pending;
}

export interface HintRepository {
  /** The hint of the day, or null. */
  forDate(date: CalendarDate): Promise<StoredHint | null>;
  /**
   * Saves the hint in the record of its day; a new `id` is made on the first
   * save. Returns false and writes nothing when template and text are the same.
   */
  put(hint: GeneratedHint): Promise<boolean>;
  /** The hints from `from` to `to` inclusive, the oldest first. */
  range(from: CalendarDate, to: CalendarDate): Promise<StoredHint[]>;
  /** Removes the records of the days before `date`, without a tombstone. */
  pruneBefore(date: CalendarDate): Promise<void>;
  subscribe(listener: () => void): () => void;
}

/** The hint as it is now: the state with the pending fields on top. */
export function currentHint(record: HintRecord): StoredHint {
  const values: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(record.state.fields)) {
    values[name] = field.value;
  }
  return { ...values, ...record.pending.fields } as unknown as StoredHint;
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  return fromDayNumber(toDayNumber(date) + days);
}

const fieldsOf = (hint: GeneratedHint): StoredHint => ({
  forDate: hint.date,
  text: hint.text,
  category: hint.category,
  templateId: hint.templateId,
  contentVersion: hint.contentVersion,
  status: "scheduled",
});

const isSame = (a: StoredHint, b: StoredHint) =>
  a.templateId === b.templateId && a.text === b.text;

export function createHintRepository(deps: {
  database: LocalDatabase;
  newId: () => string;
}): HintRepository {
  const { database, newId } = deps;
  const changes = changeChannel(database, HINTS);
  const all = async () =>
    (await database.list(HINTS)).map(({ id, value }) => ({
      id,
      record: value as unknown as HintRecord,
    }));
  const find = async (date: CalendarDate) =>
    (await all()).find(({ record }) => currentHint(record).forDate === date);
  return {
    subscribe: changes.subscribe,
    forDate: async (date) => {
      const found = await find(date);
      return found ? currentHint(found.record) : null;
    },
    put: async (hint) => {
      const fields = fieldsOf(hint);
      const found = await find(hint.date);
      if (found && isSame(currentHint(found.record), fields)) return false;
      const id = found?.id ?? newId();
      const record: HintRecord = found?.record ?? {
        shared: true,
        state: emptyEntityState(MERGE_ENTITY, id),
        pending: { fields, life: null },
      };
      record.pending.fields = fields;
      await database.put(HINTS, id, record as unknown as JsonValue);
      changes.notify();
      return true;
    },
    range: async (from, to) =>
      (await all())
        .map(({ record }) => currentHint(record))
        .filter((hint) => hint.forDate >= from && hint.forDate <= to)
        .sort((a, b) => a.forDate.localeCompare(b.forDate)),
    pruneBefore: async (date) => {
      const old = (await all()).filter(
        ({ record }) => currentHint(record).forDate < date,
      );
      for (const { id } of old) await database.delete(HINTS, id);
      if (old.length > 0) changes.notify();
    },
  };
}
