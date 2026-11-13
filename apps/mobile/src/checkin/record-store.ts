import type { ContentChange } from "@parapka/protocol";

import type { JsonValue, LocalDatabase } from "../data/local-database";
import { recordIdOf } from "./sealed-codec";

/** A record of one version of a check-in, or of its key. */
export interface VersionedRecord {
  checkinId: string;
  version: number;
  own: boolean;
  sent: boolean;
}

export interface RecordStore<R extends VersionedRecord> {
  all(): Promise<R[]>;
  write(record: R): Promise<void>;
  remove(record: R): Promise<void>;
  idOf(record: R): string;
}

/** The records of one collection, kept by the id of their version. */
export function createRecordStore<R extends VersionedRecord>(
  database: LocalDatabase,
  collection: string,
): RecordStore<R> {
  const idOf = (record: R) => recordIdOf(record.checkinId, record.version);
  return {
    idOf,
    all: async () =>
      (await database.list(collection)).map(
        ({ value }) => value as unknown as R,
      ),
    write: (record) =>
      database.put(collection, idOf(record), record as unknown as JsonValue),
    remove: (record) => database.delete(collection, idOf(record)),
  };
}

/** The record with the highest version, or null for none. */
export const newest = <R extends VersionedRecord>(records: readonly R[]) =>
  records.reduce<R | null>(
    (best, record) =>
      best === null || record.version > best.version ? record : best,
    null,
  );

/** Only the newest unsent record of each own check-in goes out. */
export async function collectOwn<R extends VersionedRecord>(
  store: RecordStore<R>,
  toChange: (record: R) => ContentChange,
) {
  const own = (await store.all()).filter((record) => record.own);
  const ids = [...new Set(own.map((record) => record.checkinId))];
  return ids.flatMap((id) => {
    const latest = newest(own.filter((record) => record.checkinId === id));
    return latest !== null && !latest.sent ? [toChange(latest)] : [];
  });
}

export async function commitSent<R extends VersionedRecord>(
  store: RecordStore<R>,
  sent: readonly ContentChange[],
) {
  const ids = new Set(sent.map((change) => change.id));
  for (const record of await store.all()) {
    if (record.own && ids.has(store.idOf(record))) {
      await store.write({ ...record, sent: true });
    }
  }
}

/**
 * Takes in the record of the partner; false when its version is known. A known
 * version is replaced only when `differs` says that the new record is another.
 */
export async function takeIn<R extends VersionedRecord>(
  store: RecordStore<R>,
  incoming: R,
  differs: (known: R, incoming: R) => boolean = () => false,
) {
  const id = store.idOf(incoming);
  const known = (await store.all()).find(
    (record) => !record.own && store.idOf(record) === id,
  );
  if (known !== undefined && !differs(known, incoming)) return false;
  await store.write(incoming);
  return true;
}

/** Removes the records of the partner; the own ones stay. */
export async function forgetReceived<R extends VersionedRecord>(
  store: RecordStore<R>,
) {
  for (const record of await store.all()) {
    if (!record.own) await store.remove(record);
  }
}
