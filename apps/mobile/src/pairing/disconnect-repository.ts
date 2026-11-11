import { changeChannel } from "../data/change-listeners";
import type { LocalDatabase } from "../data/local-database";

const COLLECTION = "pair-disconnect";
const ID = "current";

export type DisconnectState = "none" | "by-partner";

/** Whether the partner ended the pair, until the person has seen it. */
export interface DisconnectRepository {
  state(): Promise<DisconnectState>;
  markByPartner(): Promise<void>;
  /** The person saw the message; the state goes back to `none`. */
  acknowledge(): Promise<void>;
  /** Calls the listener after every change of the state; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export function createDisconnectRepository(
  db: LocalDatabase,
): DisconnectRepository {
  const changes = changeChannel(db, COLLECTION);
  return {
    subscribe: changes.subscribe,
    state: async () =>
      (await db.get(COLLECTION, ID)) === null ? "none" : "by-partner",
    markByPartner: async () => {
      await db.put(COLLECTION, ID, { by: "partner" });
      changes.notify();
    },
    acknowledge: async () => {
      await db.delete(COLLECTION, ID);
      changes.notify();
    },
  };
}
