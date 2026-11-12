import {
  ChoreValidationError,
  releaseChore,
  validateAssignment,
  validateChore,
  type Assignment,
  type Chore,
  type ChoreRule,
} from "@parapka/domain";
import type { ContentChange } from "@parapka/protocol";
import {
  emptyEntityState,
  isAlive,
  type Change,
  type EntityState,
} from "@parapka/sync";

import { changeChannel } from "../data/change-listeners";
import type { JsonValue, LocalDatabase } from "../data/local-database";
import type { Identity } from "../identity/identity";
import type { PairRepository } from "../pairing/pair-repository";
import type { NextHlc } from "../sync/handler-registry";
import { validateExtras } from "./chore-extras";
import {
  decodeAssignment,
  encodeAssignment,
  isChoreField,
  isValidField,
  type Devices,
  type StoredAssignment,
} from "./chore-codec";
import { createRecordSync } from "./record-sync";

const COLLECTION = "chores";
const ENTITY = "Chore";

/** A chore as the screens see it; the people are "me" and "partner". */
export interface StoredChore extends Chore {
  readonly assignment: Assignment;
  /** False for a chore that stays on this device (no pair, or the pair ended). */
  readonly shared: boolean;
  readonly note: string | null;
  /** The time of the reminder, `HH:MM`; nothing is scheduled yet. */
  readonly reminder: string | null;
}

export interface ChoreInput {
  readonly title: string;
  readonly rule: ChoreRule;
  readonly assignment: Assignment;
  readonly note?: string | null;
  readonly reminder?: string | null;
}

export interface AddOptions {
  readonly private?: boolean;
}

/** Local changes that have no timestamp yet; the sync stamps them. */
interface Pending {
  fields: Record<string, unknown>;
  life: "delete" | "restore" | null;
}

interface ChoreRecord {
  shared: boolean;
  state: EntityState;
  pending: Pending;
}

export interface ChoreRepository {
  /**
   * Without a confirmed pair the chore is private; `private` keeps it private
   * in a pair too. Throws on invalid input.
   */
  add(input: ChoreInput, options?: AddOptions): Promise<StoredChore>;
  /** Changes some fields of a chore; throws when it is deleted or unknown. */
  edit(id: string, changes: Partial<ChoreInput>): Promise<void>;
  /** "I can't do it" (FR-CHR-04): anyone is responsible; no event, no reason. */
  release(id: string): Promise<void>;
  /** Deletes the chore (a tombstone); the sync passes it on. */
  remove(id: string): Promise<void>;
  /** Undoes a deletion. */
  restore(id: string): Promise<void>;
  /** The chores that are not deleted, ordered by id. */
  list(): Promise<StoredChore[]>;
  subscribe(listener: () => void): () => void;
  /** For the sync handler. */
  readonly sync: {
    /** Stamps the pending changes of the shared chores. */
    collect(nextHlc: NextHlc): Promise<ContentChange[]>;
    /** Merges the collected changes into the state and drops them from pending. */
    commit(changes: readonly ContentChange[]): Promise<void>;
    /** Takes in a change of the partner; invalid fields are skipped. */
    merge(change: ContentChange): Promise<void>;
    /** Marks every chore as private; the copies stay. */
    makePrivate(): Promise<void>;
  };
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

const emptyPending = (): Pending => ({ fields: {}, life: null });

function stampPending(id: string, pending: Pending, nextHlc: NextHlc) {
  const changes: Change[] = [];
  const names = Object.keys(pending.fields);
  if (names.length > 0) {
    const fields: Record<string, { value: unknown; hlc: string }> = {};
    for (const name of names) {
      fields[name] = { value: pending.fields[name], hlc: nextHlc() };
    }
    changes.push({ entity: ENTITY, id, op: "upsert", fields });
  }
  if (pending.life !== null) {
    changes.push({ entity: ENTITY, id, op: pending.life, hlc: nextHlc() });
  }
  return changes;
}

/** Drops from pending what a collected change took over. */
function settle(pending: Pending, change: ContentChange) {
  if (change.op === "upsert") {
    for (const [name, field] of Object.entries(change.fields)) {
      if (same(pending.fields[name], field.value)) {
        Reflect.deleteProperty(pending.fields, name);
      }
    }
  } else if (pending.life === change.op) {
    pending.life = null;
  }
}

/** The change of the partner without the fields that are not valid. */
function sanitize(change: ContentChange): Change | null {
  if (change.op !== "upsert") return change as Change;
  const fields = Object.entries(change.fields).filter(
    ([name, field]) => isChoreField(name) && isValidField(name, field.value),
  );
  if (fields.length === 0) return null;
  return { ...change, fields: Object.fromEntries(fields) } as Change;
}

const isAliveNow = ({ state, pending }: ChoreRecord) =>
  pending.life === null ? isAlive(state) : pending.life === "restore";

/** The fields as they are now: the merged state with the pending edits on top. */
function currentFields({ state, pending }: ChoreRecord) {
  const values: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(state.fields)) {
    values[name] = field.value;
  }
  return { ...values, ...pending.fields };
}

function toChore(id: string, record: ChoreRecord, devices: Devices) {
  if (!isAliveNow(record)) return null;
  const { title, rule, assignment, note, reminder } = currentFields(record);
  if (title === undefined || rule === undefined || assignment === undefined) {
    return null;
  }
  return {
    id,
    title,
    rule,
    assignment: decodeAssignment(assignment as StoredAssignment, devices),
    note: note ?? null,
    reminder: reminder ?? null,
    shared: record.shared,
  } as StoredChore;
}

interface Deps {
  database: LocalDatabase;
  pairs: Pick<PairRepository, "activePair">;
  identity: Pick<Identity, "deviceId">;
  newId: () => string;
}

function createAccess({ database, pairs, identity }: Deps) {
  const changes = changeChannel(database, COLLECTION);
  const read = async (id: string) =>
    (await database.get(COLLECTION, id)) as unknown as ChoreRecord | null;
  const write = async (id: string, record: ChoreRecord) => {
    await database.put(COLLECTION, id, record as unknown as JsonValue);
    changes.notify();
  };
  const load = async (id: string) => {
    const record = await read(id);
    if (record === null) throw new ChoreValidationError("unknown chore");
    return record;
  };
  return {
    changes,
    read,
    write,
    records: async () =>
      (await database.list(COLLECTION)).map(({ id, value }) => ({
        id,
        record: value as unknown as ChoreRecord,
      })),
    devices: async (): Promise<Devices> => ({
      own: await identity.deviceId(),
      partner: (await pairs.activePair())?.deviceId ?? null,
    }),
    load,
    mark: async (id: string, life: "delete" | "restore") => {
      const record = await load(id);
      record.pending.life = life;
      await write(id, record);
    },
  };
}

type Access = ReturnType<typeof createAccess>;

const newRecord = (id: string, shared: boolean): ChoreRecord => ({
  shared,
  state: emptyEntityState(ENTITY, id),
  pending: emptyPending(),
});

function createSyncAccess(access: Access): ChoreRepository["sync"] {
  return createRecordSync({
    records: access.records,
    read: access.read,
    write: access.write,
    stampPending,
    settle,
    sanitize,
    toMerge: (change) => change as Change,
    emptyRecord: newRecord,
  });
}

/** The note and the reminder of an input, null when it has none. */
const extrasOf = (input: ChoreInput) => ({
  note: input.note ?? null,
  reminder: input.reminder ?? null,
});

export function createChoreRepository(deps: Deps): ChoreRepository {
  const access = createAccess(deps);
  const { write, load, devices, mark } = access;

  /** Validates the whole chore, queues only the fields that changed. */
  const save = async (
    id: string,
    whole: ChoreInput,
    patch: Partial<ChoreInput>,
    record: ChoreRecord,
  ) => {
    validateChore({ id, title: whole.title, rule: whole.rule });
    validateAssignment(whole.assignment);
    validateExtras(whole);
    const { assignment, ...plain } = patch;
    Object.assign(record.pending.fields, plain);
    if (assignment !== undefined) {
      const stored = encodeAssignment(assignment, await devices());
      record.pending.fields.assignment = stored;
    }
    await write(id, record);
  };
  const repository: ChoreRepository = {
    subscribe: access.changes.subscribe,
    add: async (input, options) => {
      const id = deps.newId();
      const paired = (await deps.pairs.activePair()) !== null;
      const shared = paired && options?.private !== true;
      const full = { ...input, ...extrasOf(input) };
      await save(id, full, input, newRecord(id, shared));
      return { id, ...full, shared };
    },
    edit: async (id, patch) => {
      const record = await load(id);
      const current = toChore(id, record, await devices());
      if (current === null) throw new ChoreValidationError("chore is deleted");
      await save(id, { ...current, ...patch }, patch, record);
    },
    release: (id) => repository.edit(id, { assignment: releaseChore() }),
    remove: (id) => mark(id, "delete"),
    restore: (id) => mark(id, "restore"),
    list: async () => {
      const who = await devices();
      return (await access.records()).flatMap(({ id, record }) => {
        const chore = toChore(id, record, who);
        return chore === null ? [] : [chore];
      });
    },
    sync: createSyncAccess(access),
  };
  return repository;
}
