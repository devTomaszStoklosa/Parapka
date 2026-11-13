import type { ContentChange } from "@parapka/protocol";

import { changeChannel } from "../data/change-listeners";
import type { LocalDatabase } from "../data/local-database";
import type { Identity } from "../identity/identity";
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
  newest,
  takeIn,
} from "./record-store";
import { recordIdOf } from "./sealed-codec";

export interface KeyRepository {
  /** Queues the key of an own version to be sent, once. */
  addOwn(checkinId: string, version: number, key: string): Promise<void>;
  /** The newest key of the partner for the check-in, or null. */
  partnerKey(checkinId: string): Promise<KeyRecord | null>;
  sync: RecordHandlerSync;
  subscribe(listener: () => void): () => void;
  forgetReceived(): Promise<void>;
}

interface Deps {
  database: LocalDatabase;
  identity: Pick<Identity, "deviceId">;
}

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
  const { database, identity } = deps;
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
    partnerKey: async (checkinId) =>
      newest(
        (await store.all()).filter(
          (record) => !record.own && record.checkinId === checkinId,
        ),
      ),
    forgetReceived: () => forgetReceived(store),
    sync: {
      collect: (nextHlc) => collectOwn(store, toChange(nextHlc)),
      commit: (sent) => commitSent(store, sent),
      merge: async (change) => {
        const incoming = parseKey(change, await identity.deviceId());
        if (incoming !== null && (await takeIn(store, incoming))) {
          changes.notify();
        }
      },
      makePrivate: () => Promise.resolve(),
    },
  };
}
