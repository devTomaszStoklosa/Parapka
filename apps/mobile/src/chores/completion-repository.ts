import { ChoreValidationError, type Clock } from "@parapka/domain";
import type { ContentChange } from "@parapka/protocol";
import {
  createHlc,
  emptyEntityState,
  formatHlc,
  isAlive,
  mergeCompletions,
  parseHlc,
  type Change,
  type EntityState,
} from "@parapka/sync";

import { changeChannel } from "../data/change-listeners";
import type { JsonValue, LocalDatabase } from "../data/local-database";
import type { Identity } from "../identity/identity";
import type { NextHlc } from "../sync/handler-registry";
import { ChoreDeviceError } from "./chore-codec";
import type { ChoreRepository } from "./chore-repository";
import { createRecordSync } from "./record-sync";

const COLLECTION = "chore-completions";
const ENTITY = "ChoreCompletion";
// The merge of `@parapka/sync` knows the entities it lists; the state of a
// check-off is merged as a "Chore" and only the envelope carries ENTITY.
const MERGE_ENTITY = "Chore";
const FIELDS = ["choreId", "occurrenceDate", "completedBy", "completedAt"];

/** One check-off of one occurrence of a chore (FR-CHR-03). */
export interface StoredCompletion {
  readonly choreId: string;
  /** The day of the occurrence, e.g. `2026-11-05`. */
  readonly occurrenceDate: string;
  /** The `deviceId` of the person who ticked it off. */
  readonly completedBy: string;
  /** The HLC (text form) of the moment of the check-off. */
  readonly completedAt: string;
}

/** Local changes that have no timestamp yet; the sync stamps them. */
interface Pending {
  fields: StoredCompletion | null;
  life: "delete" | "restore" | null;
}

interface CompletionRecord {
  shared: boolean;
  state: EntityState;
  pending: Pending;
}

export interface CompletionRepository {
  /**
   * Ticks off an occurrence of a chore. It is shared or private as the chore
   * is now. Throws when the chore is unknown.
   */
  complete(choreId: string, occurrenceDate: string): Promise<void>;
  /** Takes back the check-off of this device; the one of the partner stays. */
  undo(choreId: string, occurrenceDate: string): Promise<void>;
  /** One check-off per occurrence, the earlier one, ordered by chore and day. */
  list(): Promise<StoredCompletion[]>;
  subscribe(listener: () => void): () => void;
  /** For the sync handler. */
  readonly sync: {
    /** Stamps the pending changes of the shared check-offs. */
    collect(nextHlc: NextHlc): Promise<ContentChange[]>;
    /** Merges the collected changes into the state and drops them from pending. */
    commit(changes: readonly ContentChange[]): Promise<void>;
    /** Takes in a change of the partner; invalid fields are skipped. */
    merge(change: ContentChange): Promise<void>;
    /** Marks every check-off as private; the copies stay. */
    makePrivate(): Promise<void>;
  };
}

interface Deps {
  database: LocalDatabase;
  chores: Pick<ChoreRepository, "list">;
  identity: Pick<Identity, "deviceId">;
  clock: Clock;
}

const emptyRecord = (id: string, shared: boolean): CompletionRecord => ({
  shared,
  state: emptyEntityState(MERGE_ENTITY, id),
  pending: { fields: null, life: null },
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

/** True when a value may be kept as the field. */
const isValidField = (name: string, value: unknown) => {
  if (name === "completedAt") return isHlcText(value);
  if (name === "occurrenceDate") {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }
  return isText(value);
};

const forMerge = (change: ContentChange) =>
  ({ ...change, entity: MERGE_ENTITY }) as Change;

/** The change of the partner without the fields that are not valid. */
function sanitize(change: ContentChange): Change | null {
  if (change.op !== "upsert") return forMerge(change);
  const fields = Object.entries(change.fields).filter(
    ([name, field]) => FIELDS.includes(name) && isValidField(name, field.value),
  );
  if (fields.length === 0) return null;
  return forMerge({ ...change, fields: Object.fromEntries(fields) });
}

function stampPending(id: string, { fields, life }: Pending, nextHlc: NextHlc) {
  const changes: ContentChange[] = [];
  if (fields !== null) {
    const stamped: Record<string, { value: unknown; hlc: string }> = {};
    for (const [name, value] of Object.entries(fields)) {
      stamped[name] = { value, hlc: nextHlc() };
    }
    changes.push({ entity: ENTITY, id, op: "upsert", fields: stamped });
  }
  if (life !== null) {
    changes.push({ entity: ENTITY, id, op: life, hlc: nextHlc() });
  }
  return changes;
}

/** Drops from pending what a collected change took over. */
function settle(pending: Pending, change: ContentChange) {
  if (change.op === "upsert") {
    pending.fields = null;
  } else if (pending.life === change.op) {
    pending.life = null;
  }
}

const isAliveNow = ({ state, pending }: CompletionRecord) =>
  pending.life === null ? isAlive(state) : pending.life === "restore";

/** The check-off as it is now, or null when it is deleted or incomplete. */
function toCompletion(record: CompletionRecord): StoredCompletion | null {
  if (!isAliveNow(record)) return null;
  const values: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(record.state.fields)) {
    values[name] = field.value;
  }
  const whole: Record<string, unknown> = {
    ...values,
    ...record.pending.fields,
  };
  return FIELDS.every((name) => isValidField(name, whole[name]))
    ? (whole as unknown as StoredCompletion)
    : null;
}

function createAccess({ database, identity }: Deps) {
  const changes = changeChannel(database, COLLECTION);
  return {
    changes,
    read: async (id: string) =>
      (await database.get(
        COLLECTION,
        id,
      )) as unknown as CompletionRecord | null,
    write: async (id: string, record: CompletionRecord) => {
      await database.put(COLLECTION, id, record as unknown as JsonValue);
      changes.notify();
    },
    records: async () =>
      (await database.list(COLLECTION)).map(({ id, value }) => ({
        id,
        record: value as unknown as CompletionRecord,
      })),
    /** The id holds the device, so only the own check-off can be undone. */
    ownId: async (choreId: string, occurrenceDate: string) => {
      const deviceId = await identity.deviceId();
      if (deviceId === null) throw new ChoreDeviceError();
      return { deviceId, id: [choreId, occurrenceDate, deviceId].join("|") };
    },
  };
}

export function createCompletionRepository(deps: Deps): CompletionRepository {
  const { changes, read, write, records, ownId } = createAccess(deps);
  return {
    subscribe: changes.subscribe,
    complete: async (choreId, occurrenceDate) => {
      const chore = (await deps.chores.list()).find((c) => c.id === choreId);
      if (chore === undefined) throw new ChoreValidationError("unknown chore");
      if (!isValidField("occurrenceDate", occurrenceDate)) {
        throw new ChoreValidationError("invalid occurrence date");
      }
      const { deviceId, id } = await ownId(choreId, occurrenceDate);
      const record = (await read(id)) ?? emptyRecord(id, chore.shared);
      record.pending.fields = {
        choreId,
        occurrenceDate,
        completedBy: deviceId,
        completedAt: formatHlc(createHlc(deps.clock.nowMs(), 0, deviceId)),
      };
      if (!isAliveNow(record)) record.pending.life = "restore";
      await write(id, record);
    },
    undo: async (choreId, occurrenceDate) => {
      const { id } = await ownId(choreId, occurrenceDate);
      const record = await read(id);
      if (record === null || !isAliveNow(record)) return;
      record.pending.life = "delete";
      await write(id, record);
    },
    list: async () => {
      const alive = (await records()).flatMap(({ record }) => {
        const completion = toCompletion(record);
        return completion === null ? [] : [completion];
      });
      return mergeCompletions(
        alive.map((c) => ({ ...c, hlc: parseHlc(c.completedAt) })),
      ).map(({ hlc, ...rest }) => ({ ...rest, completedAt: formatHlc(hlc) }));
    },
    sync: createRecordSync({
      records,
      read,
      write,
      stampPending,
      settle,
      sanitize,
      toMerge: forMerge,
      emptyRecord,
    }),
  };
}
