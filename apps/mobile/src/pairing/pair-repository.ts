import type { PairKeys } from "@parapka/crypto";

import type { JsonValue, LocalDatabase } from "../data/local-database";
import type { KeyStore } from "../platform/key-store";

const COLLECTION = "pair";
const ID = "current";
const SEND_KEY = "pair/send-key";
const RECEIVE_KEY = "pair/receive-key";

/** A pair is not used for sync until both people confirm the safety code. */
export type PairState = "pending-confirmation" | "confirmed";

export interface PairRecord {
  readonly pairMailboxId: string;
  readonly partnerDeviceId: string;
  /** Base64url public keys of the partner. */
  readonly partnerSigningPublicKey: string;
  readonly partnerAgreementPublicKey: string;
  readonly state: PairState;
}

export interface ActivePair {
  readonly record: PairRecord;
  readonly keys: PairKeys;
}

export interface PairRepository {
  /** The saved pair in any state, or null. */
  get(): Promise<PairRecord | null>;
  /** Saves a new pair as `pending-confirmation`, with its keys. */
  savePending(record: Omit<PairRecord, "state">, keys: PairKeys): Promise<void>;
  confirm(): Promise<void>;
  /** Removes the pair and its keys. */
  reject(): Promise<void>;
  /** The confirmed pair with its keys; sync reads only this. */
  active(): Promise<ActivePair | null>;
}

export function createPairRepository(
  database: LocalDatabase,
  keyStore: KeyStore,
): PairRepository {
  const get = async () =>
    (await database.get(COLLECTION, ID)) as unknown as PairRecord | null;
  const put = (record: PairRecord) =>
    database.put(COLLECTION, ID, record as unknown as JsonValue);
  return {
    get,
    // Keys go first, so a record in the database always has its keys.
    savePending: async (record, keys) => {
      await keyStore.set(SEND_KEY, keys.sendKey);
      await keyStore.set(RECEIVE_KEY, keys.receiveKey);
      await put({ ...record, state: "pending-confirmation" });
    },
    confirm: async () => {
      const record = await get();
      if (record) await put({ ...record, state: "confirmed" });
    },
    reject: async () => {
      await database.delete(COLLECTION, ID);
      await keyStore.delete(SEND_KEY);
      await keyStore.delete(RECEIVE_KEY);
    },
    active: async () => {
      const record = await get();
      if (record?.state !== "confirmed") return null;
      const sendKey = await keyStore.get(SEND_KEY);
      const receiveKey = await keyStore.get(RECEIVE_KEY);
      if (!sendKey || !receiveKey) return null;
      return { record, keys: { sendKey, receiveKey } };
    },
  };
}
