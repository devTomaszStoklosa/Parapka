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
  /** For the sync handler. */
  readonly sync: {
    /** Stamps the pending entries of the shared items. */
    collect(nextHlc: NextHlc): Promise<ContentChange[]>;
    /** Merges the collected entries into the state and drops them from pending. */
    commit(changes: readonly ContentChange[]): Promise<void>;
    /** Takes in an entry of the partner; invalid ones are skipped. */
    merge(change: ContentChange): Promise<void>;
    /** Marks every entry as private; the copies stay. */
    makePrivate(): Promise<void>;
  };
}

interface Deps {
  database: LocalDatabase;
  identity: Pick<Identity, "deviceId">;
  clock: Pick<Clock, "nowMs">;
}

const emptyRecord = (id: string, shared: boolean): CarrierRecord => ({
  shared,
  state: emptyEntityState(MERGE_ENTITY, id),
  pending: { fields: null },
});

const isText = (value: unknown): value is string =>
  typeof value === "string" && value !== "";

const isHlcText = (value: unknown) => {
  try {
    parseHlc(value as string);
    return true;
  } catch {
    return false;
  }
};

const isValidField = (name: string, value: unknown) =>
  name === "changedAt" ? isHlcText(value) : isText(value);

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
  return {
    changes,
    read: async (id: string) =>
      (await database.get(COLLECTION, id)) as unknown as CarrierRecord | null,
    write: async (id: string, record: CarrierRecord) => {
      await database.put(COLLECTION, id, record as unknown as JsonValue);
      changes.notify();
    },
    records: async () =>
      (await database.list(COLLECTION)).map(({ id, value }) => ({
        id,
        record: value as unknown as CarrierRecord,
      })),
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
