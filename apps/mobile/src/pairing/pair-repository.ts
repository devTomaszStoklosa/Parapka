import type { PairKeys } from "@parapka/crypto";

import { changeChannel } from "../data/change-listeners";
import type { JsonValue, LocalDatabase } from "../data/local-database";
import type { KeyStore } from "../platform/key-store";

const COLLECTION = "pair";
const ID = "current";
const SEND_KEY = "pair/send";
const RECEIVE_KEY = "pair/receive";

export type PairState = "pending-confirmation" | "confirmed";

/** What the database holds about the pair: no key material of the pair. */
export interface Pair {
  readonly pairMailboxId: string;
  /** The device id of the partner; null on B's side until sync (#110) learns it. */
  readonly deviceId: string | null;
  /** Base64url public keys of the partner. */
  readonly signingPublicKey: string;
  readonly agreementPublicKey: string;
  readonly state: PairState;
}

export interface PairRepository {
  /** The pair in any state, or null. */
  current(): Promise<Pair | null>;
  /** Only a `confirmed` pair. */
  activePair(): Promise<Pair | null>;
  /** Saves the pair as `pending-confirmation` with its keys. */
  savePending(pair: Omit<Pair, "state">, keys: PairKeys): Promise<void>;
  confirm(): Promise<void>;
  /** The keys of the current pair, or null. */
  keys(): Promise<PairKeys | null>;
  /** Removes the pair and its keys. */
  remove(): Promise<void>;
  /** Calls the listener after every change of the pair; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export function createPairRepository(
  database: LocalDatabase,
  keyStore: KeyStore,
): PairRepository {
  const changes = changeChannel(database, COLLECTION);
  const current = async () =>
    (await database.get(COLLECTION, ID)) as Pair | null;
  const write = (pair: Pair) =>
    database.put(COLLECTION, ID, pair as unknown as JsonValue);
  return {
    subscribe: changes.subscribe,
    current,
    activePair: async () => {
      const pair = await current();
      return pair?.state === "confirmed" ? pair : null;
    },
    // Keys go first, so a record in the database always has its keys.
    savePending: async (pair, keys) => {
      await keyStore.set(SEND_KEY, keys.sendKey);
      await keyStore.set(RECEIVE_KEY, keys.receiveKey);
      await write({ ...pair, state: "pending-confirmation" });
      changes.notify();
    },
    confirm: async () => {
      const pair = await current();
      if (!pair) return;
      await write({ ...pair, state: "confirmed" });
      changes.notify();
    },
    keys: async () => {
      const sendKey = await keyStore.get(SEND_KEY);
      const receiveKey = await keyStore.get(RECEIVE_KEY);
      return sendKey && receiveKey ? { sendKey, receiveKey } : null;
    },
    remove: async () => {
      await database.delete(COLLECTION, ID);
      await keyStore.delete(SEND_KEY);
      await keyStore.delete(RECEIVE_KEY);
      changes.notify();
    },
  };
}
