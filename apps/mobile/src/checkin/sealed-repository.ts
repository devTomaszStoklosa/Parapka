import { sealCheckin, type Sodium } from "@parapka/crypto";
import type { IsoWeek } from "@parapka/domain";
import type { ContentChange } from "@parapka/protocol";

import { ChoreDeviceError } from "../chores/chore-codec";
import { changeChannel } from "../data/change-listeners";
import type { LocalDatabase } from "../data/local-database";
import type { Identity } from "../identity/identity";
import type { PairRepository } from "../pairing/pair-repository";
import { base64Decode, base64Encode } from "../sync/base64";
import type { NextHlc } from "../sync/handler-registry";
import type { RecordHandlerSync } from "../sync/record-handler";
import {
  collectOwn,
  commitSent,
  createRecordStore,
  forgetReceived,
  newest,
  takeIn,
  type RecordStore,
} from "./record-store";
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

/** The own sealed version, as the exchange of the keys needs it. */
export interface OwnSealed {
  checkinId: string;
  version: number;
  sealKey: string;
}

export interface SealedRepository {
  /** Seals the answers as the next version of the own check-in of the week. */
  submit(week: IsoWeek, plaintext: Uint8Array): Promise<void>;
  /** The sealed versions of the partner for the week, the newest first. */
  partnerVersions(week: IsoWeek): Promise<PartnerSealed[]>;
  /** The newest sealed version of the partner for the week, or null. */
  latestPartner(week: IsoWeek): Promise<PartnerSealed | null>;
  partnerFilled(week: IsoWeek): Promise<boolean>;
  /** The weeks that have a sealed version, own or of the partner. */
  weeks(): Promise<IsoWeek[]>;
  /** The newest own version of the week with its key, or null. */
  latestOwn(week: IsoWeek): Promise<OwnSealed | null>;
  sync: RecordHandlerSync;
  subscribe(listener: () => void): () => void;
  forgetReceived(): Promise<void>;
}

interface Deps {
  database: LocalDatabase;
  identity: Pick<Identity, "deviceId">;
  pairs: Pick<PairRepository, "activePair">;
  sodium: Sodium;
}

const toChange =
  (nextHlc: NextHlc) =>
  (record: SealedRecord): ContentChange => {
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

/** Seals the answers as the next own version of the week. */
async function sealOwn(
  store: RecordStore<SealedRecord>,
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

/** The reads of the sealed versions that the exchange of the keys needs. */
function createReaders(store: RecordStore<SealedRecord>) {
  const newestOf = async (own: boolean, week: IsoWeek) =>
    newest((await store.all()).filter((r) => r.own === own && r.week === week));
  const partnerVersions = async (week: IsoWeek): Promise<PartnerSealed[]> =>
    (await store.all())
      .filter((r) => !r.own && r.week === week)
      .sort((x, y) => y.version - x.version)
      .map((r) => ({
        checkinId: r.checkinId,
        authorId: r.authorId,
        version: r.version,
        nonce: base64Decode(r.nonce),
        ciphertext: base64Decode(r.ciphertext),
      }));
  return {
    weeks: async () => [
      ...new Set((await store.all()).map((record) => record.week)),
    ],
    partnerVersions,
    latestPartner: async (week: IsoWeek) =>
      (await partnerVersions(week))[0] ?? null,
    latestOwn: async (week: IsoWeek): Promise<OwnSealed | null> => {
      const best = await newestOf(true, week);
      if (best === null) return null;
      const { checkinId, version, sealKey } = best;
      return { checkinId, version, sealKey: sealKey as string };
    },
  };
}

/**
 * The sealed versions of the check-ins, kept in the local database: the own
 * ones with their key, which never leaves the device, and the received ones.
 */
export function createSealedRepository(deps: Deps): SealedRepository {
  const { database, identity, pairs, sodium } = deps;
  const changes = changeChannel(database, SEALED_COLLECTION);
  const store = createRecordStore<SealedRecord>(database, SEALED_COLLECTION);
  const { latestPartner, latestOwn, weeks, partnerVersions } =
    createReaders(store);
  return {
    subscribe: changes.subscribe,
    latestPartner,
    partnerVersions,
    partnerFilled: async (week) => (await latestPartner(week)) !== null,
    weeks,
    latestOwn,
    submit: async (week, plaintext) => {
      const authorId = await identity.deviceId();
      if (authorId === null) throw new ChoreDeviceError();
      await sealOwn(store, { sodium, authorId }, week, plaintext);
      changes.notify();
    },
    forgetReceived: async () => {
      await forgetReceived(store);
      changes.notify();
    },
    sync: {
      collect: (nextHlc) => collectOwn(store, toChange(nextHlc)),
      commit: (sent) => commitSent(store, sent),
      merge: async (change) => {
        const incoming = parseSealed(
          change,
          (await pairs.activePair())?.deviceId ?? null,
        );
        if (incoming !== null && (await takeIn(store, incoming))) {
          changes.notify();
        }
      },
      makePrivate: () => Promise.resolve(),
    },
  };
}
