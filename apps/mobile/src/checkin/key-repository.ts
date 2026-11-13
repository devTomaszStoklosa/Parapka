import type { IsoWeek } from "@parapka/domain";
import type { ContentChange } from "@parapka/protocol";

import { changeChannel } from "../data/change-listeners";
import type { LocalDatabase } from "../data/local-database";
import type { PairRepository } from "../pairing/pair-repository";
import type { NextHlc } from "../sync/handler-registry";
import type { RecordHandlerSync } from "../sync/record-handler";
import {
  KEY_COLLECTION,
  KEY_ENTITY,
  parseKey,
  type KeyRecord,
} from "./key-codec";
import {
  collectOwn,
  commitSent,
  createRecordStore,
  forgetReceived,
  removeWhere,
  resendWeek,
  takeIn,
  weekOfCheckinId,
  type RecordStore,
} from "./record-store";
import { recordIdOf } from "./sealed-codec";

export interface KeyRepository {
  /** Queues the key of an own version to be sent, once. */
  addOwn(checkinId: string, version: number, key: string): Promise<void>;
  /** The key of the partner for the version of the check-in, or null. */
  partnerKey(checkinId: string, version: number): Promise<KeyRecord | null>;
  sync: RecordHandlerSync;
  subscribe(listener: () => void): () => void;
  /** Removes what the partner sent; with `until`, not what is newer than it. */
  forgetReceived(until?: string): Promise<void>;
  /** Marks the newest own key of the week to be sent again. */
  resendWeek(week: IsoWeek): Promise<void>;
  /** The weeks that have a key, own or of the partner. */
  weeks(): Promise<IsoWeek[]>;
  /** True when the own key of the week has been sent. */
  ownSent(week: IsoWeek): Promise<boolean>;
  /** Removes the keys of the partner for the week. */
  dropReceived(week: IsoWeek): Promise<void>;
  /** Removes the own keys of the week that wait to be sent. */
  dropUnsent(week: IsoWeek): Promise<void>;
}

interface Deps {
  database: LocalDatabase;
  pairs: Pick<PairRepository, "activePair">;
}

/** A key of a known version replaces it when its bytes are others. */
const replaces = ({ key: known }: KeyRecord, { key: next }: KeyRecord) =>
  known !== next;

const toChange =
  (nextHlc: NextHlc) =>
  (record: KeyRecord): ContentChange => {
    const field = (value: unknown) => ({ value, hlc: nextHlc() });
    return {
      entity: KEY_ENTITY,
      id: recordIdOf(record.checkinId, record.version),
      op: "upsert",
      fields: {
        checkinId: field(record.checkinId),
        version: field(record.version),
        key: field(record.key),
      },
    };
  };

/** Removes the keys of the week that match; tells the listeners of a change. */
const dropper =
  (store: RecordStore<KeyRecord>, notify: () => void) =>
  async (week: IsoWeek, matches: (record: KeyRecord) => boolean) => {
    const removed = await removeWhere(
      store,
      (record) => weekOfCheckinId(record.checkinId) === week && matches(record),
    );
    if (removed > 0) notify();
  };

/** The reads of the keys by week that the clean-up needs. */
const weekReaders = (store: RecordStore<KeyRecord>) => ({
  weeks: async () => [
    ...new Set(
      (await store.all()).flatMap(({ checkinId }) => {
        const week = weekOfCheckinId(checkinId);
        return week === null ? [] : [week];
      }),
    ),
  ],
  partnerKey: async (checkinId: string, version: number) =>
    (await store.all()).find(
      (record) =>
        !record.own &&
        record.checkinId === checkinId &&
        record.version === version,
    ) ?? null,
  ownSent: async (week: IsoWeek) =>
    (await store.all()).some(
      (record) =>
        record.own && record.sent && weekOfCheckinId(record.checkinId) === week,
    ),
});

/** The keys of the own versions, which leave the device once the check-in is locked, and the keys of the partner. */
export function createKeyRepository(deps: Deps): KeyRepository {
  const { database, pairs } = deps;
  const changes = changeChannel(database, KEY_COLLECTION);
  const store = createRecordStore<KeyRecord>(database, KEY_COLLECTION);
  const drop = dropper(store, changes.notify);
  const readers = weekReaders(store);
  return {
    subscribe: changes.subscribe,
    weeks: readers.weeks,
    ownSent: readers.ownSent,
    dropReceived: (week) => drop(week, (record) => !record.own),
    dropUnsent: (week) => drop(week, (record) => record.own && !record.sent),
    addOwn: async (checkinId, version, key) => {
      const known = (await store.all()).some(
        (record) =>
          record.own &&
          record.checkinId === checkinId &&
          record.version === version,
      );
      if (known) return;
      await store.write({ checkinId, version, key, own: true, sent: false });
      changes.notify();
    },
    partnerKey: readers.partnerKey,
    forgetReceived: async (until) => {
      await forgetReceived(store, until);
      changes.notify();
    },
    resendWeek: (week) => resendWeek(store, week),
    sync: {
      collect: (nextHlc) => collectOwn(store, toChange(nextHlc)),
      commit: (sent) => commitSent(store, sent),
      merge: async (change) => {
        const incoming = parseKey(
          change,
          (await pairs.activePair())?.deviceId ?? null,
        );
        if (incoming !== null && (await takeIn(store, incoming, replaces))) {
          changes.notify();
        }
      },
      makePrivate: () => Promise.resolve(),
    },
  };
}
