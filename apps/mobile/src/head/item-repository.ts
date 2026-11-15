import {
  ChoreValidationError,
  createMentalLoadItem,
  validateChoreTitle,
  type Clock,
  type MentalLoadCategory,
} from "@parapka/domain";
import type { ContentChange } from "@parapka/protocol";
import { emptyEntityState, type Change } from "@parapka/sync";

import { createShareableRecordSync } from "../chores/record-sync";
import { changeChannel } from "../data/change-listeners";
import type { JsonValue, LocalDatabase } from "../data/local-database";
import type { PairRepository } from "../pairing/pair-repository";
import type { NextHlc } from "../sync/handler-registry";
import { isValidDueDate } from "./item-codec";
import {
  currentFields,
  sanitize,
  toItem,
  type ItemInput,
  type ItemRecord,
  type Pending,
  type StoredItem,
} from "./item-record";

const COLLECTION = "mental-load-items";
const ENTITY = "MentalLoadItem";

export type { ItemInput, StoredItem };

export interface AddOptions {
  readonly private?: boolean;
}

export interface ItemRepository {
  /**
   * Without a confirmed pair the item is private; `private` keeps it private
   * in a pair too. Throws on invalid input.
   */
  add(input: ItemInput, options?: AddOptions): Promise<StoredItem>;
  /** Changes some fields of an item; throws when it is deleted or unknown. */
  edit(id: string, changes: Partial<ItemInput>): Promise<void>;
  /** "Done" (FR-MNT-06): status `done` and the moment, kept as the archive. */
  complete(id: string): Promise<void>;
  /** Deletes the item (a tombstone); the sync passes it on. */
  remove(id: string): Promise<void>;
  /** Undoes a deletion. */
  restore(id: string): Promise<void>;
  /** The items that are not deleted, open and done, ordered by id. */
  list(): Promise<StoredItem[]>;
  subscribe(listener: () => void): () => void;
  /** For the sync handler. */
  readonly sync: {
    /** Stamps the pending changes of the shared items. */
    collect(nextHlc: NextHlc): Promise<ContentChange[]>;
    /** Merges the collected changes into the state and drops them from pending. */
    commit(changes: readonly ContentChange[]): Promise<void>;
    /** Takes in a change of the partner; invalid fields are skipped. */
    merge(change: ContentChange): Promise<void>;
    /** Marks every item as private; the copies stay. */
    makePrivate(): Promise<void>;
    /** Makes the private items picked by `belongs` shared, with their whole state. */
    share(belongs: (id: string) => boolean): Promise<void>;
  };
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

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

const newRecord = (id: string, shared: boolean): ItemRecord => ({
  shared,
  state: emptyEntityState(ENTITY, id),
  pending: { fields: {}, life: null },
});

/** Throws when the whole item is not valid. */
function validateItem(item: {
  title: string;
  category: MentalLoadCategory;
  weight: number;
  dueDate: string | null;
}) {
  validateChoreTitle(item.title);
  // The carrier is not a field of the item: its entries are checked and kept
  // by the head service, so any valid one stands in here.
  createMentalLoadItem({
    category: item.category,
    carrier: "me",
    weight: item.weight,
  });
  if (!isValidDueDate(item.dueDate)) {
    throw new ChoreValidationError("invalid due date");
  }
}

/** The fields of a new item with the defaults; throws when they are invalid. */
function newFields(input: ItemInput) {
  const fields = {
    title: input.title,
    category: input.category ?? "other",
    weight: input.weight ?? 2,
    dueDate: input.dueDate ?? null,
  };
  validateItem(fields);
  return { ...fields, status: "open", doneAt: null };
}

interface Deps {
  database: LocalDatabase;
  pairs: Pick<PairRepository, "activePair">;
  clock: Pick<Clock, "nowMs">;
  newId: () => string;
}

function createAccess({ database }: Deps) {
  const changes = changeChannel(database, COLLECTION);
  const read = async (id: string) =>
    (await database.get(COLLECTION, id)) as unknown as ItemRecord | null;
  const write = async (id: string, record: ItemRecord) => {
    await database.put(COLLECTION, id, record as unknown as JsonValue);
    changes.notify();
  };
  const load = async (id: string) => {
    const record = await read(id);
    if (record === null) throw new ChoreValidationError("unknown item");
    return record;
  };
  return {
    changes,
    read,
    write,
    records: async () =>
      (await database.list(COLLECTION)).map(({ id, value }) => ({
        id,
        record: value as unknown as ItemRecord,
      })),
    /** The live item of `id` with its record; throws when there is none. */
    loadItem: async (id: string) => {
      const record = await load(id);
      const item = toItem(id, record);
      if (item === null) throw new ChoreValidationError("item is deleted");
      return { record, item };
    },
    mark: async (id: string, life: "delete" | "restore") => {
      const record = await load(id);
      record.pending.life = life;
      await write(id, record);
    },
  };
}

export function createItemRepository(deps: Deps): ItemRepository {
  const access = createAccess(deps);
  const { write, loadItem, mark, records } = access;
  return {
    subscribe: access.changes.subscribe,
    add: async (input, options) => {
      const id = deps.newId();
      const paired = (await deps.pairs.activePair()) !== null;
      const record = newRecord(id, paired && options?.private !== true);
      Object.assign(record.pending.fields, newFields(input));
      await write(id, record);
      return toItem(id, record) as StoredItem;
    },
    edit: async (id, patch) => {
      const { record, item } = await loadItem(id);
      validateItem({ ...item, ...patch });
      Object.assign(record.pending.fields, patch);
      await write(id, record);
    },
    complete: async (id) => {
      const { record, item } = await loadItem(id);
      if (item.status === "done") return;
      Object.assign(record.pending.fields, {
        status: "done",
        doneAt: deps.clock.nowMs(),
      });
      await write(id, record);
    },
    remove: (id) => mark(id, "delete"),
    restore: (id) => mark(id, "restore"),
    list: async () =>
      (await records()).flatMap(({ id, record }) => {
        const item = toItem(id, record);
        return item === null ? [] : [item];
      }),
    sync: createShareableRecordSync({
      reseed: (record) => {
        record.pending.fields = currentFields(record);
      },
      records,
      read: access.read,
      write,
      stampPending,
      settle,
      sanitize,
      toMerge: (change) => change as Change,
      emptyRecord: newRecord,
    }),
  };
}
