import { ChoreValidationError, type Clock } from "@parapka/domain";
import type { ContentChange } from "@parapka/protocol";
import {
  createHlc,
  emptyEntityState,
  formatHlc,
  parseHlc,
  type Change,
  type EntityState,
  type HandoverStatus,
} from "@parapka/sync";

import { ChoreDeviceError } from "../chores/chore-codec";
import { createRecordSync } from "../chores/record-sync";
import { changeChannel } from "../data/change-listeners";
import type { JsonValue, LocalDatabase } from "../data/local-database";
import type { Identity } from "../identity/identity";
import type { NextHlc } from "../sync/handler-registry";

const COLLECTION = "handover-requests";
const ENTITY = "HandoverRequest";
// The merge of `@parapka/sync` knows the entities it lists; the state of an
// entry is merged as a "Chore" and only the envelope carries ENTITY.
const MERGE_ENTITY = "Chore";
const FIELDS = ["requestId", "itemId", "requestedBy", "status", "changedAt"];

const STATUSES: readonly string[] = ["pending", "accepted", "declined"];

/** One state of a handover request; entries are only ever added. */
export interface StoredHandoverRequest {
  readonly requestId: string;
  readonly itemId: string;
  /** The `deviceId` of the person who asked, kept by every entry. */
  readonly requestedBy: string;
  readonly status: HandoverStatus;
  /** The HLC (text form) of the moment of the change. */
  readonly changedAt: string;
}

interface HandoverRecord {
  shared: boolean;
  state: EntityState;
  pending: { fields: StoredHandoverRequest | null };
}

export interface HandoverRepository {
  /**
   * Adds an entry made by this device now. It is shared or private as the item
   * is; `shared` tells which. Throws on invalid input.
   */
  append(change: {
    requestId: string;
    itemId: string;
    requestedBy: string;
    status: HandoverStatus;
    shared: boolean;
  }): Promise<void>;
  /** Every entry, ordered by request and moment. */
  list(): Promise<StoredHandoverRequest[]>;
  subscribe(listener: () => void): () => void;
  /** For the sync handler: collect, commit, merge and makePrivate. */
  readonly sync: ReturnType<typeof createRecordSync>;
}

interface Deps {
  clock: Pick<Clock, "nowMs">;
  identity: Pick<Identity, "deviceId">;
  database: LocalDatabase;
}

const emptyRecord = (id: string, shared: boolean): HandoverRecord => {
  const pending = { fields: null };
  return { pending, shared, state: emptyEntityState(MERGE_ENTITY, id) };
};

const isText = (value: unknown): value is string =>
  typeof value === "string" && value !== "";

const isValidField = (name: string, value: unknown) => {
  if (!isText(value)) return false;
  if (name === "status") return STATUSES.includes(value);
  if (name !== "changedAt") return true;
  try {
    parseHlc(value);
  } catch {
    return false;
  }
  return true;
};

const entryId = (requestId: string, changedAt: string) =>
  `${requestId}|${changedAt}`;

/** The entry of the partner, whole and valid, or null; no deletions. */
function sanitize(change: ContentChange): Change | null {
  if (change.op !== "upsert") return null;
  const values: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(change.fields)) {
    values[name] = field.value;
  }
  const whole =
    FIELDS.every((name) => isValidField(name, values[name])) &&
    change.id ===
      entryId(values.requestId as string, values.changedAt as string);
  return whole ? { ...change, entity: MERGE_ENTITY } : null;
}

function stampPending(
  id: string,
  fields: HandoverRecord["pending"],
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
function toEntry(record: HandoverRecord): StoredHandoverRequest {
  const values: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(record.state.fields)) {
    values[name] = field.value;
  }
  return {
    ...values,
    ...record.pending.fields,
  } as unknown as StoredHandoverRequest;
}

function createAccess({ database }: Deps) {
  const changes = changeChannel(database, COLLECTION);
  const toRecord = (value: JsonValue) => value as unknown as HandoverRecord;
  return {
    changes,
    read: async (id: string) => {
      const value = await database.get(COLLECTION, id);
      return value === null ? null : toRecord(value);
    },
    write: async (id: string, record: HandoverRecord) => {
      await database.put(COLLECTION, id, record as unknown as JsonValue);
      changes.notify();
    },
    records: async () => {
      const rows = await database.list(COLLECTION);
      return rows.map((row) => ({ id: row.id, record: toRecord(row.value) }));
    },
  };
}

export function createHandoverRepository(deps: Deps): HandoverRepository {
  const { changes, read, write, records } = createAccess(deps);
  return {
    subscribe: changes.subscribe,
    append: async ({ requestId, itemId, requestedBy, status, shared }) => {
      const whole = { requestId, itemId, requestedBy, status };
      if (!Object.entries(whole).every(([n, v]) => isValidField(n, v))) {
        throw new ChoreValidationError("invalid handover request");
      }
      const deviceId = await deps.identity.deviceId();
      if (deviceId === null) throw new ChoreDeviceError();
      const changedAt = formatHlc(createHlc(deps.clock.nowMs(), 0, deviceId));
      const id = entryId(requestId, changedAt);
      const record = emptyRecord(id, shared);
      record.pending.fields = { ...whole, changedAt };
      await write(id, record);
    },
    list: async () => {
      const entries = (await records()).map(({ record }) => toEntry(record));
      return entries.sort((a, b) =>
        entryId(a.requestId, a.changedAt).localeCompare(
          entryId(b.requestId, b.changedAt),
        ),
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
