import { ChoreValidationError, type Clock } from "@parapka/domain";
import type { ContentChange } from "@parapka/protocol";
import {
  emptyEntityState,
  formatHlc,
  HybridLogicalClock,
  parseHlc,
  type Change,
  type EntityState,
} from "@parapka/sync";

import { ChoreDeviceError } from "../chores/chore-codec";
import { createRecordSync } from "../chores/record-sync";
import { changeChannel } from "../data/change-listeners";
import type { JsonValue, LocalDatabase } from "../data/local-database";
import type { Identity } from "../identity/identity";
import type { NextHlc } from "../sync/handler-registry";

// The merge of `@parapka/sync` knows the entities it lists; the state of an
// entry is merged as a "Chore" and only the envelope carries the entity.
const MERGE_ENTITY = "Chore";

export interface AppendEntryDeps {
  clock: Pick<Clock, "nowMs">;
  identity: Pick<Identity, "deviceId">;
  database: LocalDatabase;
}

export interface AppendEntryConfig {
  readonly collection: string;
  readonly entity: string;
  /** The text fields of an entry, besides `changedAt`. */
  readonly fields: readonly string[];
  /** The field whose value, with `changedAt`, makes the id of an entry. */
  readonly keyField: string;
  /** A field that this device fills with its own `deviceId`, if any. */
  readonly deviceField?: string;
  /** Tells whether a non-empty text is a valid value of a field. */
  readonly isValidField: (name: string, value: string) => boolean;
  /** The message of the error for an invalid entry. */
  readonly invalidMessage: string;
}

interface EntryRecord {
  shared: boolean;
  state: EntityState;
  pending: { fields: Record<string, string> | null };
}

/** An entry as the repository keeps it: text fields, with `changedAt`. */
export type Entry = Record<string, string> & { readonly changedAt: string };

export interface AppendEntryRepository {
  /**
   * Adds an entry made by this device now. It is shared or private as the item
   * is; `shared` tells which. With `after` (an HLC in text form) the entry is
   * later than it, even when this clock is behind. Throws on invalid input.
   */
  append: (
    values: Record<string, string>,
    shared: boolean,
    after?: string,
  ) => Promise<void>;
  /** Every entry, ordered by key and moment. */
  list(): Promise<Entry[]>;
  subscribe(listener: () => void): () => void;
  /** For the sync handler: collect, commit, merge and makePrivate. */
  readonly sync: ReturnType<typeof createRecordSync>;
}

const isText = (value: unknown): value is string =>
  typeof value === "string" && value !== "";

const isHlc = (value: string) => {
  try {
    parseHlc(value);
  } catch {
    return false;
  }
  return true;
};

const entryId = (key: string, changedAt: string) => `${key}|${changedAt}`;

function valuesOf(fields: Record<string, { value: unknown }>) {
  const values: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(fields)) {
    values[name] = field.value;
  }
  return values;
}

function createAccess(database: LocalDatabase, collection: string) {
  const changes = changeChannel(database, collection);
  const toRecord = (value: JsonValue) => value as unknown as EntryRecord;
  return {
    changes,
    read: async (id: string) => {
      const value = await database.get(collection, id);
      return value === null ? null : toRecord(value);
    },
    write: async (id: string, record: EntryRecord) => {
      await database.put(collection, id, record as unknown as JsonValue);
      changes.notify();
    },
    records: async () => {
      const rows = await database.list(collection);
      return rows.map((row) => ({ id: row.id, record: toRecord(row.value) }));
    },
  };
}

/** The entry of the partner, whole and valid, or null; no deletions. */
function createSanitize(config: AppendEntryConfig) {
  const { fields, keyField } = config;
  const isValid = (name: string, value: unknown) =>
    isText(value) &&
    (name === "changedAt" ? isHlc(value) : config.isValidField(name, value));
  const sanitize = (change: ContentChange): Change | null => {
    if (change.op !== "upsert") return null;
    const values = valuesOf(change.fields);
    const whole =
      [...fields, "changedAt"].every((name) => isValid(name, values[name])) &&
      change.id ===
        entryId(values[keyField] as string, values.changedAt as string);
    return whole ? { ...change, entity: MERGE_ENTITY } : null;
  };
  return { isValid, sanitize };
}

const createStampPending =
  (entity: string) =>
  (id: string, pending: EntryRecord["pending"], nextHlc: NextHlc) => {
    if (pending.fields === null) return [];
    const stamped: Record<string, { value: unknown; hlc: string }> = {};
    for (const [name, value] of Object.entries(pending.fields)) {
      stamped[name] = { value, hlc: nextHlc() };
    }
    return [{ entity, id, op: "upsert", fields: stamped }] as ContentChange[];
  };

const emptyRecord = (id: string, shared: boolean): EntryRecord => ({
  pending: { fields: null },
  shared,
  state: emptyEntityState(MERGE_ENTITY, id),
});

/** The entry of a record: a taken-in one is whole, a local one is pending. */
const toEntry = (record: EntryRecord) =>
  ({
    ...valuesOf(record.state.fields),
    ...record.pending.fields,
  }) as unknown as Entry;

/**
 * A repository of entries that are only ever added: an entry is never edited,
 * so the entries of two devices never conflict.
 */
export function createAppendEntryRepository(
  config: AppendEntryConfig,
  { clock, identity, database }: AppendEntryDeps,
): AppendEntryRepository {
  const { collection, entity, fields, keyField, deviceField } = config;
  const { changes, read, write, records } = createAccess(database, collection);
  const { isValid, sanitize } = createSanitize(config);
  const keyOf = (entry: Entry) =>
    entryId(entry[keyField] as string, entry.changedAt);

  return {
    subscribe: changes.subscribe,
    append: async (values, shared, after) => {
      const given = fields.filter((name) => name !== deviceField);
      if (!given.every((name) => isValid(name, values[name]))) {
        throw new ChoreValidationError(config.invalidMessage);
      }
      const deviceId = await identity.deviceId();
      if (deviceId === null) throw new ChoreDeviceError();
      const hlc = new HybridLogicalClock(clock, deviceId);
      const changedAt = formatHlc(
        after === undefined ? hlc.now() : hlc.receive(parseHlc(after)),
      );
      const id = entryId(values[keyField] as string, changedAt);
      const record = emptyRecord(id, shared);
      const device =
        deviceField === undefined ? {} : { [deviceField]: deviceId };
      record.pending.fields = { ...values, ...device, changedAt };
      await write(id, record);
    },
    list: async () => {
      const entries = (await records()).map(({ record }) => toEntry(record));
      return entries.sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
    },
    sync: createRecordSync({
      records,
      read,
      write,
      stampPending: createStampPending(entity),
      settle: (pending) => {
        pending.fields = null;
      },
      sanitize,
      toMerge: (change) => ({ ...change, entity: MERGE_ENTITY }),
      emptyRecord,
    }),
  };
}
