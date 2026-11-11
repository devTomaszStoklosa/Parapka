import type { LocalDatabase } from "../data/local-database";

export const OUTBOX = "sync-outbox";
export const APPLIED = "sync-applied";
export const ERRORS = "sync-errors";
export const HELD = "sync-held";
export const STATE = "sync-state";
export const CURSOR = "cursor";
export const CLOCK = "hlc";
/** The marker of the pair that is being closed; holds its `pairMailboxId`. */
export const CLOSING = { collection: "pair-closing", id: "current" };

const COLLECTIONS = [APPLIED, HELD, ERRORS];

/**
 * Forgets what the engine knows of the pair: the cursor and the records of
 * received envelopes. The queue and the clock stay.
 */
export async function clearEngineState(database: LocalDatabase) {
  await database.delete(STATE, CURSOR);
  for (const collection of COLLECTIONS) {
    for (const record of await database.list(collection)) {
      await database.delete(collection, record.id);
    }
  }
}
