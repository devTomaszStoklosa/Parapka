import { changeChannel } from "../data/change-listeners";
import type { LocalDatabase } from "../data/local-database";

const COLLECTION = "sync-pause";
const ID = "current";

/** The pause of sending (FR-PAIR-06); it stays on this device, the partner never learns it. */
export interface PauseRepository {
  isPaused(): Promise<boolean>;
  setPaused(paused: boolean): Promise<void>;
  /** Calls the listener after every change of the state; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export function createPauseRepository(db: LocalDatabase): PauseRepository {
  const changes = changeChannel(db, COLLECTION);
  return {
    subscribe: changes.subscribe,
    isPaused: async () =>
      ((await db.get(COLLECTION, ID)) as { paused: boolean } | null)?.paused ===
      true,
    setPaused: async (paused) => {
      await db.put(COLLECTION, ID, { paused });
      changes.notify();
    },
  };
}
