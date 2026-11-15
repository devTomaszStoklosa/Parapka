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
  type HintStatus,
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
  /**
   * Replaces template, text and category in the record of the day, keeping its
   * `id`, and sets the status to scheduled. Returns false and writes nothing
   * without a record of the day or when nothing would change.
   */
  replace(hint: GeneratedHint): Promise<boolean>;
  /**
   * Sets the status of the hint of the day. Returns false and writes nothing
   * without a record of the day or when the status is the same.
   */
  setStatus(date: CalendarDate, status: HintStatus): Promise<boolean>;
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

/**
 * Marks the hints for `date` and later to be sent anew, all fields; the
 * earlier ones turn private, so they are not sent.
 */
async function resend(
  { all, write }: Pick<ReturnType<typeof createAccess>, "all" | "write">,
  date: CalendarDate,
) {
  for (const { id, record } of await all()) {
    const { forDate, text, category, status } = currentHint(record);
    if (forDate < date) {
      // A past hint stays on the phone but never leaves it as history.
      if (!record.shared) continue;
      record.shared = false;
      await write(id, record);
      continue;
    }
    record.shared = true;
    record.pending.fields = { forDate, text, category, status };
    await write(id, record);
  }
}

const queues = new WeakMap<LocalDatabase, Promise<unknown>>();

// Writes of all repositories on one database run one after another, so the
// read of a day and its write cannot interleave with another instance.
function exclusive<T>(database: LocalDatabase, task: () => Promise<T>) {
  const run = (queues.get(database) ?? Promise.resolve()).then(task);
  queues.set(
    database,
    run.catch(() => undefined),
  );
  return run;
}

type Found = { id: string; record: HintRecord } | undefined;

/** Writes the new fields and local part of the record of `date`, if they differ. */
async function change(
  access: {
    find: (date: CalendarDate) => Promise<Found>;
    write: (id: string, record: HintRecord) => Promise<void>;
  },
  fields: SentHint,
  local: Local,
) {
  const found = await access.find(fields.forDate);
  if (!found) return false;
  const current = currentHint(found.record);
  const { templateId, contentVersion } = local;
  const same =
    templateId === current.templateId &&
    (Object.keys(fields) as (keyof SentHint)[]).every(
      (name) => fields[name] === current[name],
    );
  if (same) return false;
  found.record.pending.fields = fields;
  found.record.local = { templateId, contentVersion };
  await access.write(found.id, found.record);
  return true;
}

type Access = Parameters<typeof change>[0];

async function withStatus(
  access: Access,
  date: CalendarDate,
  status: HintStatus,
) {
  const found = await access.find(date);
  if (!found) return false;
  const { forDate, text, category, templateId, contentVersion } = currentHint(
    found.record,
  );
  return change(
    access,
    { forDate, text, category, status },
    { templateId, contentVersion },
  );
}

async function putHint(
  access: Access,
  newId: () => string,
  hint: GeneratedHint,
) {
  const found = await access.find(hint.date);
  if (found && isSame(currentHint(found.record), hint)) return false;
  const id = found?.id ?? newId();
  const record = found?.record ?? emptyRecord(id, true);
  record.pending.fields = fieldsOf(hint);
  record.local = {
    templateId: hint.templateId,
    contentVersion: hint.contentVersion,
  };
  await access.write(id, record);
  return true;
}

export function createHintRepository(deps: {
  database: LocalDatabase;
  newId: () => string;
}): HintRepository {
  const { database, newId } = deps;
  const { changes, all, write, sync } = createAccess(database);
  const find = async (date: CalendarDate) =>
    (await all()).find(({ record }) => currentHint(record).forDate === date);
  const forDate = async (date: CalendarDate) => {
    const found = await find(date);
    return found ? currentHint(found.record) : null;
  };
  const prune = async (date: CalendarDate) => {
    const old = (await all()).filter(
      ({ record }) => currentHint(record).forDate < date,
    );
    for (const { id } of old) await database.delete(HINTS, id);
    if (old.length > 0) changes.notify();
  };
  return {
    subscribe: changes.subscribe,
    sync,
    forDate,
    put: (hint) =>
      exclusive(database, () => putHint({ find, write }, newId, hint)),
    replace: (hint) =>
      exclusive(database, () =>
        change({ find, write }, fieldsOf(hint), {
          templateId: hint.templateId,
          contentVersion: hint.contentVersion,
        }),
      ),
    setStatus: (date, status) =>
      exclusive(database, () => withStatus({ find, write }, date, status)),
    range: async (from, to) =>
      (await all())
        .map(({ record }) => currentHint(record))
        .filter((hint) => hint.forDate >= from && hint.forDate <= to)
        .sort((a, b) => a.forDate.localeCompare(b.forDate)),
    resendFrom: (date) =>
      exclusive(database, () => resend({ all, write }, date)),
    pruneBefore: (date) => exclusive(database, () => prune(date)),
  };
}
