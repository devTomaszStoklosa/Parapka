import {
  ChoreValidationError,
  DEFAULT_CHECKIN_SCHEDULE,
  type CheckinSchedule,
} from "@parapka/domain";
import type { ContentChange } from "@parapka/protocol";
import { emptyEntityState, type Change, type EntityState } from "@parapka/sync";

import { createRecordSync } from "../chores/record-sync";
import { changeChannel } from "../data/change-listeners";
import type { JsonValue, LocalDatabase } from "../data/local-database";
import type { PairRepository } from "../pairing/pair-repository";
import type { NextHlc } from "../sync/handler-registry";
import {
  COLLECTION,
  DEFAULT_FIELDS,
  ENTITY,
  RECORD_ID,
  isValidScheduleField,
  toFields,
  toSchedule,
} from "./schedule-codec";

/** Local changes that have no timestamp yet; the sync stamps them. */
interface Pending {
  fields: Record<string, unknown>;
}

interface ScheduleRecord {
  shared: boolean;
  state: EntityState;
  pending: Pending;
}

export interface ScheduleRepository {
  /** The schedule of the pair; Sunday 19:00 without a record or a pair. */
  get(): Promise<CheckinSchedule>;
  /** Changes the schedule of the pair; throws when invalid or without a pair. */
  set(schedule: CheckinSchedule): Promise<void>;
  subscribe(listener: () => void): () => void;
  /** Removes the record: the pair is over and the next one starts afresh. */
  forget(): Promise<void>;
  /** For the sync handler. */
  readonly sync: ReturnType<typeof createRecordSync<Pending, ScheduleRecord>>;
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

const newRecord = (id: string, shared: boolean): ScheduleRecord => ({
  shared,
  state: emptyEntityState(ENTITY, id),
  pending: { fields: {} },
});

/** The fields as they are now: the merged state with the pending ones on top. */
function currentValues({ state, pending }: ScheduleRecord) {
  const values: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(state.fields)) {
    values[name] = field.value;
  }
  return { ...values, ...pending.fields };
}

/** Puts into pending the wanted fields that differ from the current ones. */
function addChanged(record: ScheduleRecord, wanted: Record<string, unknown>) {
  const current: Record<string, unknown> = {
    ...DEFAULT_FIELDS,
    ...currentValues(record),
  };
  for (const [name, value] of Object.entries(wanted)) {
    if (!same(current[name], value)) record.pending.fields[name] = value;
  }
}

function stampPending(id: string, pending: Pending, nextHlc: NextHlc) {
  const fields: Record<string, { value: unknown; hlc: string }> = {};
  for (const [name, value] of Object.entries(pending.fields)) {
    fields[name] = { value, hlc: nextHlc() };
  }
  if (Object.keys(fields).length === 0) return [];
  return [{ entity: ENTITY, id, op: "upsert", fields } as Change];
}

/** Drops from pending what a collected change took over. */
function settle(pending: Pending, change: ContentChange) {
  if (change.op !== "upsert") return;
  for (const [name, field] of Object.entries(change.fields)) {
    if (same(pending.fields[name], field.value)) {
      Reflect.deleteProperty(pending.fields, name);
    }
  }
}

/** The change of the partner without the fields that are not valid. */
function sanitize(change: ContentChange): Change | null {
  if (change.op !== "upsert") return null;
  const fields = Object.entries(change.fields).filter(([name, field]) =>
    isValidScheduleField(name, field.value),
  );
  if (fields.length === 0) return null;
  return { ...change, fields: Object.fromEntries(fields) } as Change;
}

interface Deps {
  database: LocalDatabase;
  pairs: Pick<PairRepository, "activePair">;
}

export function createScheduleRepository({
  database,
  pairs,
}: Deps): ScheduleRepository {
  const changes = changeChannel(database, COLLECTION);
  const read = async (id: string) =>
    (await database.get(COLLECTION, id)) as unknown as ScheduleRecord | null;
  const write = async (id: string, record: ScheduleRecord) => {
    await database.put(COLLECTION, id, record as unknown as JsonValue);
    changes.notify();
  };
  return {
    subscribe: changes.subscribe,
    get: async () => {
      const record = await read(RECORD_ID);
      if (record === null || (await pairs.activePair()) === null) {
        return { ...DEFAULT_CHECKIN_SCHEDULE };
      }
      return toSchedule(currentValues(record));
    },
    set: async (schedule) => {
      const wanted = toFields(schedule);
      if ((await pairs.activePair()) === null) {
        throw new ChoreValidationError("there is no pair");
      }
      const record = (await read(RECORD_ID)) ?? newRecord(RECORD_ID, true);
      addChanged(record, wanted);
      await write(RECORD_ID, record);
    },
    forget: async () => {
      await database.delete(COLLECTION, RECORD_ID);
      changes.notify();
    },
    sync: createRecordSync({
      records: async () =>
        (await database.list(COLLECTION)).map(({ id, value }) => ({
          id,
          record: value as unknown as ScheduleRecord,
        })),
      read,
      write,
      stampPending,
      settle,
      sanitize,
      toMerge: (change) => change as Change,
      emptyRecord: newRecord,
    }),
  };
}
