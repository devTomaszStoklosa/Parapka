import { ChoreValidationError, type Clock } from "@parapka/domain";
import type { ContentChange } from "@parapka/protocol";
import {
  createHlc,
  emptyEntityState,
  formatHlc,
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

const COLLECTION = "carrier-changes";
const ENTITY = "CarrierChange";
// The merge of `@parapka/sync` knows the entities it lists; the state of an
// entry is merged as a "Chore" and only the envelope carries ENTITY.
const MERGE_ENTITY = "Chore";
const FIELDS = ["itemId", "carrier", "changedBy", "changedAt"];

/** One change of the carrier of an item; entries are only ever added. */
export interface StoredCarrierChange {
  readonly itemId: string;
  /** The `deviceId` of the person who carries the item, or `both`. */
  readonly carrier: string;
  /** The `deviceId` of the person who made the change. */
  readonly changedBy: string;
  /** The HLC (text form) of the moment of the change. */
  readonly changedAt: string;
}

interface CarrierRecord {
  shared: boolean;
  state: EntityState;
  pending: { fields: StoredCarrierChange | null };
}

export interface CarrierRepository {
  /**
   * Adds an entry made by this device now. It is shared or private as the item
   * is; `shared` tells which. Throws on invalid input.
   */
  append(change: {
    itemId: string;
    carrier: string;
    shared: boolean;
  }): Promise<void>;
  /** Every entry, ordered by item and moment. */
  list(): Promise<StoredCarrierChange[]>;
  subscribe(listener: () => void): () => void;
  /** For the sync handler: collect, commit, merge and makePrivate. */
  readonly sync: ReturnType<typeof createRecordSync>;
}

interface Deps {
  clock: Pick<Clock, "nowMs">;
  identity: Pick<Identity, "deviceId">;
  database: LocalDatabase;
}

const emptyRecord = (id: string, shared: boolean): CarrierRecord => {
  const pending = { fields: null };
  return { pending, shared, state: emptyEntityState(MERGE_ENTITY, id) };
};

const isText = (value: unknown): value is string =>
  typeof value === "string" && value !== "";

const isValidField = (name: string, value: unknown) => {
  if (!isText(value)) return false;
  if (name !== "changedAt") return true;
  try {
    parseHlc(value);
  } catch {
    return false;
  }
  return true;
};

const entryId = (itemId: string, changedAt: string) => `${itemId}|${changedAt}`;

/** The entry of the partner, whole and valid, or null; no deletions. */
function sanitize(change: ContentChange): Change | null {
  if (change.op !== "upsert") return null;
  const values: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(change.fields)) {
    values[name] = field.value;
  }
  const whole =
    FIELDS.every((name) => isValidField(name, values[name])) &&
    change.id === entryId(values.itemId as string, values.changedAt as string);
  return whole ? { ...change, entity: MERGE_ENTITY } : null;
}

function stampPending(
  id: string,
  fields: CarrierRecord["pending"],
  nextHlc: NextHlc,
) {
  if (fields.fields === null) return [];
  const stamped: Record<string, { value: unknown; hlc: string }> = {};
  for (const [name, value] of Object.entries(fields.fields)) {
    stamped[name] = { value, hlc: nextHlc() };
  }
  return [
    { entity: ENTITY, id, op: "upsert", fields: stamped },
  ] as ContentChange[];
}

/** The entry of a record: a taken-in one is whole, a local one is pending. */
function toEntry(record: CarrierRecord): StoredCarrierChange {
  const values: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(record.state.fields)) {
    values[name] = field.value;
  }
  return {
    ...values,
    ...record.pending.fields,
  } as unknown as StoredCarrierChange;
}

function createAccess({ database }: Deps) {
  const changes = changeChannel(database, COLLECTION);
  const toRecord = (value: JsonValue) => value as unknown as CarrierRecord;
  return {
    changes,
    read: async (id: string) => {
      const value = await database.get(COLLECTION, id);
      return value === null ? null : toRecord(value);
    },
    write: async (id: string, record: CarrierRecord) => {
      await database.put(COLLECTION, id, record as unknown as JsonValue);
      changes.notify();
    },
    records: async () => {
      const rows = await database.list(COLLECTION);
      return rows.map((row) => ({ id: row.id, record: toRecord(row.value) }));
    },
  };
}

export function createCarrierRepository(deps: Deps): CarrierRepository {
  const { changes, read, write, records } = createAccess(deps);
  return {
    subscribe: changes.subscribe,
    append: async ({ itemId, carrier, shared }) => {
      if (!isText(itemId) || !isText(carrier)) {
        throw new ChoreValidationError("invalid carrier change");
      }
      const deviceId = await deps.identity.deviceId();
      if (deviceId === null) throw new ChoreDeviceError();
      const changedAt = formatHlc(createHlc(deps.clock.nowMs(), 0, deviceId));
      const id = entryId(itemId, changedAt);
      const record = emptyRecord(id, shared);
      record.pending.fields = {
        itemId,
        carrier,
        changedBy: deviceId,
        changedAt,
      };
      await write(id, record);
    },
    list: async () => {
      const entries = (await records()).map(({ record }) => toEntry(record));
      return entries.sort((a, b) =>
        entryId(a.itemId, a.changedAt) < entryId(b.itemId, b.changedAt)
          ? -1
          : 1,
      );
    },
    sync: createRecordSync({
      records,
      read,
      write,
      stampPending,
      settle: (pending) => {
        pending.fields = null;
      },
      sanitize,
      toMerge: (change) => ({ ...change, entity: MERGE_ENTITY }),
      emptyRecord,
    }),
  };
}
