import {
  fromDayNumber,
  toDayNumber,
  type CalendarDate,
  type GeneratedHint,
} from "@parapka/domain";
import { emptyEntityState, type EntityState } from "@parapka/sync";

import { changeChannel } from "../data/change-listeners";
import type { JsonValue, LocalDatabase } from "../data/local-database";
import { createRecordSync } from "../chores/record-sync";
import {
  ENTITY,
  sanitize,
  settle,
  stampPending,
  toMerge,
  type Pending,
  type SentHint,
} from "./hint-codec";

export const HINTS = "cycle-hints";

/** The fields of a hint of the own person; one per day (spec §3 `Hint`). */
export interface StoredHint extends SentHint, Local {}

/** What stays on the phone and is never sent (FR-CYC-09). */
export interface Local {
  templateId: string;
  contentVersion: number;
}

/** The shape that `createRecordSync` takes, so the sync only adds a handler. */
export interface HintRecord {
  shared: boolean;
  state: EntityState;
  pending: Pending;
  local: Local;
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
  /**
   * Marks the hints for `date` and later as shared and not sent, with all
   * fields, so the partner gets them anew; earlier hints stay as they are.
   */
  resendFrom(date: CalendarDate): Promise<void>;
  subscribe(listener: () => void): () => void;
  /** For the sync handler: the own hints that leave the phone. */
  readonly sync: Pick<
    ReturnType<typeof createRecordSync>,
    "collect" | "commit" | "makePrivate"
  >;
}

/** The hint as it is now: the state with the pending fields on top. */
export function currentHint(record: HintRecord): StoredHint {
  const values: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(record.state.fields)) {
    values[name] = field.value;
  }
  return {
    ...values,
    ...record.pending.fields,
    ...record.local,
  } as unknown as StoredHint;
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  return fromDayNumber(toDayNumber(date) + days);
}

const fieldsOf = (hint: GeneratedHint): SentHint => ({
  forDate: hint.date,
  text: hint.text,
  category: hint.category,
  status: "scheduled",
});

const emptyRecord = (id: string, shared: boolean): HintRecord => ({
  shared,
  state: emptyEntityState(ENTITY, id),
  pending: { fields: null, life: null },
  local: { templateId: "", contentVersion: 0 },
});

const isSame = (a: StoredHint, b: GeneratedHint) =>
  a.templateId === b.templateId && a.text === b.text;

function createAccess(database: LocalDatabase) {
  const changes = changeChannel(database, HINTS);
  const all = async () =>
    (await database.list(HINTS)).map(({ id, value }) => ({
      id,
      record: value as unknown as HintRecord,
    }));
  const read = async (id: string) =>
    (await database.get(HINTS, id)) as unknown as HintRecord | null;
  const write = async (id: string, record: HintRecord) => {
    await database.put(HINTS, id, record as unknown as JsonValue);
    changes.notify();
  };
  const { collect, commit, makePrivate } = createRecordSync<
    Pending,
    HintRecord
  >({
    records: all,
    read,
    write,
    stampPending,
    settle,
    sanitize,
    toMerge,
    emptyRecord,
  });
  return { changes, all, write, sync: { collect, commit, makePrivate } };
}

/** Marks the hints for `date` and later to be sent anew, all fields. */
async function resend(
  { all, write }: Pick<ReturnType<typeof createAccess>, "all" | "write">,
  date: CalendarDate,
) {
  for (const { id, record } of await all()) {
    const { forDate, text, category, status } = currentHint(record);
    if (forDate < date) continue;
    record.shared = true;
    record.pending.fields = { forDate, text, category, status };
    await write(id, record);
  }
}

export function createHintRepository(deps: {
  database: LocalDatabase;
  newId: () => string;
}): HintRepository {
  const { database, newId } = deps;
  const { changes, all, write, sync } = createAccess(database);
  const find = async (date: CalendarDate) =>
    (await all()).find(({ record }) => currentHint(record).forDate === date);
  return {
    subscribe: changes.subscribe,
    sync,
    forDate: async (date) => {
      const found = await find(date);
      return found ? currentHint(found.record) : null;
    },
    put: async (hint) => {
      const found = await find(hint.date);
      if (found && isSame(currentHint(found.record), hint)) return false;
      const id = found?.id ?? newId();
      const local = {
        templateId: hint.templateId,
        contentVersion: hint.contentVersion,
      };
      const record = found?.record ?? emptyRecord(id, true);
      record.pending.fields = fieldsOf(hint);
      record.local = local;
      await write(id, record);
      return true;
    },
    range: async (from, to) =>
      (await all())
        .map(({ record }) => currentHint(record))
        .filter((hint) => hint.forDate >= from && hint.forDate <= to)
        .sort((a, b) => a.forDate.localeCompare(b.forDate)),
    resendFrom: (date) => resend({ all, write }, date),
    pruneBefore: async (date) => {
      const old = (await all()).filter(
        ({ record }) => currentHint(record).forDate < date,
      );
      for (const { id } of old) await database.delete(HINTS, id);
      if (old.length > 0) changes.notify();
    },
  };
}
