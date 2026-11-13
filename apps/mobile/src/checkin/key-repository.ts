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
  takeIn,
} from "./record-store";
import { recordIdOf } from "./sealed-codec";

export interface KeyRepository {
  /** Queues the key of an own version to be sent, once. */
  addOwn(checkinId: string, version: number, key: string): Promise<void>;
  /** The key of the partner for the version of the check-in, or null. */
  partnerKey(checkinId: string, version: number): Promise<KeyRecord | null>;
  sync: RecordHandlerSync;
  subscribe(listener: () => void): () => void;
  forgetReceived(): Promise<void>;
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

/** The keys of the own versions, which leave the device once the check-in is locked, and the keys of the partner. */
export function createKeyRepository(deps: Deps): KeyRepository {
  const { database, pairs } = deps;
  const changes = changeChannel(database, KEY_COLLECTION);
  const store = createRecordStore<KeyRecord>(database, KEY_COLLECTION);
  return {
    subscribe: changes.subscribe,
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
    partnerKey: async (checkinId, version) =>
      (await store.all()).find(
        (record) =>
          !record.own &&
          record.checkinId === checkinId &&
          record.version === version,
      ) ?? null,
    forgetReceived: async () => {
      await forgetReceived(store);
      changes.notify();
    },
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
