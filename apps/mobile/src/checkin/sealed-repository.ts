import { sealCheckin, type Sodium } from "@parapka/crypto";
import type { IsoWeek } from "@parapka/domain";
import type { ContentChange } from "@parapka/protocol";

import { ChoreDeviceError } from "../chores/chore-codec";
import { changeChannel } from "../data/change-listeners";
import type { JsonValue, LocalDatabase } from "../data/local-database";
import type { Identity } from "../identity/identity";
import { base64Decode, base64Encode } from "../sync/base64";
import type { NextHlc } from "../sync/handler-registry";
import type { RecordHandlerSync } from "../sync/record-handler";
import {
  SEALED_COLLECTION,
  SEALED_ENTITY,
  checkinIdOf,
  parseSealed,
  recordIdOf,
  type SealedRecord,
} from "./sealed-codec";

/** The sealed version of the partner, as the exchange of the keys needs it. */
export interface PartnerSealed {
  checkinId: string;
  authorId: string;
  version: number;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
}

export interface SealedRepository {
  /** Seals the answers as the next version of the own check-in of the week. */
  submit(week: IsoWeek, plaintext: Uint8Array): Promise<void>;
  /** The newest sealed version of the partner for the week, or null. */
  latestPartner(week: IsoWeek): Promise<PartnerSealed | null>;
  partnerFilled(week: IsoWeek): Promise<boolean>;
  sync: RecordHandlerSync;
  subscribe(listener: () => void): () => void;
  forgetReceived(): Promise<void>;
}

interface Deps {
  database: LocalDatabase;
  identity: Pick<Identity, "deviceId">;
  sodium: Sodium;
}

const toChange = (record: SealedRecord, nextHlc: NextHlc): ContentChange => {
  const field = (value: unknown) => ({ value, hlc: nextHlc() });
  return {
    entity: SEALED_ENTITY,
    id: recordIdOf(record.checkinId, record.version),
    op: "upsert",
    fields: {
      checkinId: field(record.checkinId),
      week: field(record.week),
      authorId: field(record.authorId),
      version: field(record.version),
      nonce: field(record.nonce),
      ciphertext: field(record.ciphertext),
    },
  };
};

/** The version with the highest number, or null for none. */
const newest = (records: readonly SealedRecord[]) =>
  records.reduce<SealedRecord | null>(
    (best, record) =>
      best === null || record.version > best.version ? record : best,
    null,
  );

interface Store {
  all(): Promise<SealedRecord[]>;
  write(record: SealedRecord): Promise<void>;
  remove(record: SealedRecord): Promise<void>;
}

const idOf = (record: SealedRecord) =>
  recordIdOf(record.checkinId, record.version);

const createStore = (database: LocalDatabase): Store => ({
  all: async () =>
    (await database.list(SEALED_COLLECTION)).map(
      ({ value }) => value as unknown as SealedRecord,
    ),
  write: (record) =>
    database.put(
      SEALED_COLLECTION,
      idOf(record),
      record as unknown as JsonValue,
    ),
  remove: (record) => database.delete(SEALED_COLLECTION, idOf(record)),
});

/** Only the newest unsent version of each own check-in goes out. */
async function collectOwn(store: Store, nextHlc: NextHlc) {
  const own = (await store.all()).filter((record) => record.own);
  const ids = [...new Set(own.map((record) => record.checkinId))];
  return ids.flatMap((id) => {
    const latest = newest(own.filter((record) => record.checkinId === id));
    return latest !== null && !latest.sent ? [toChange(latest, nextHlc)] : [];
  });
}

async function commitSent(store: Store, sent: readonly ContentChange[]) {
  const ids = new Set(sent.map((change) => change.id));
  for (const record of await store.all()) {
    if (record.own && ids.has(idOf(record))) {
      await store.write({ ...record, sent: true });
    }
  }
}

/** Takes in the version of the partner; false when there is nothing new. */
async function takeIn(store: Store, incoming: SealedRecord) {
  const known = newest(
    (await store.all()).filter(
      (record) => !record.own && record.checkinId === incoming.checkinId,
    ),
  );
  if (known !== null && known.version >= incoming.version) return false;
  if (known !== null) await store.remove(known);
  await store.write(incoming);
  return true;
}

/** Seals the answers as the next own version of the week. */
async function sealOwn(
  store: Store,
  { sodium, authorId }: { sodium: Sodium; authorId: string },
  week: IsoWeek,
  plaintext: Uint8Array,
) {
  const checkinId = checkinIdOf(week, authorId);
  const mine = (await store.all()).filter((r) => r.checkinId === checkinId);
  const version = (newest(mine)?.version ?? 0) + 1;
  const { key, sealed } = sealCheckin(
    sodium,
    { checkinId, authorId, version },
    plaintext,
  );
  await store.write({
    checkinId,
    week,
    authorId,
    version,
    nonce: base64Encode(sealed.nonce),
    ciphertext: base64Encode(sealed.ciphertext),
    own: true,
    sent: false,
    sealKey: base64Encode(key),
  });
}

/**
 * The sealed versions of the check-ins, kept in the local database: the own
 * ones with their key, which never leaves the device, and the received ones.
 */
export function createSealedRepository(deps: Deps): SealedRepository {
  const { database, identity, sodium } = deps;
  const changes = changeChannel(database, SEALED_COLLECTION);
  const store = createStore(database);
  const latestPartner = async (week: IsoWeek) => {
    const best = newest(
      (await store.all()).filter((r) => !r.own && r.week === week),
    );
    if (best === null) return null;
    return {
      checkinId: best.checkinId,
      authorId: best.authorId,
      version: best.version,
      nonce: base64Decode(best.nonce),
      ciphertext: base64Decode(best.ciphertext),
    };
  };
  return {
    subscribe: changes.subscribe,
    latestPartner,
    partnerFilled: async (week) => (await latestPartner(week)) !== null,
    submit: async (week, plaintext) => {
      const authorId = await identity.deviceId();
      if (authorId === null) throw new ChoreDeviceError();
      await sealOwn(store, { sodium, authorId }, week, plaintext);
      changes.notify();
    },
    forgetReceived: async () => {
      for (const record of await store.all()) {
        if (!record.own) await store.remove(record);
      }
    },
    sync: {
      collect: (nextHlc) => collectOwn(store, nextHlc),
      commit: (sent) => commitSent(store, sent),
      merge: async (change) => {
        const incoming = parseSealed(change, await identity.deviceId());
        if (incoming !== null && (await takeIn(store, incoming))) {
          changes.notify();
        }
      },
      makePrivate: () => Promise.resolve(),
    },
  };
}
