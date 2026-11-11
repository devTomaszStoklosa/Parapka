import type { ContentChange } from "@parapka/protocol";

import type { LocalDatabase } from "../data/local-database";
import type { PairRepository } from "../pairing/pair-repository";

export const OUTBOX = "sync-outbox";
export const APPLIED = "sync-applied";
export const ERRORS = "sync-errors";
export const HELD = "sync-held";
export const STATE = "sync-state";
export const CURSOR = "cursor";
export const CLOCK = "hlc";

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

/** True when a handler ended the pair while the engine worked. */
export async function pairEnded(pairs: Pick<PairRepository, "activePair">) {
  return (await pairs.activePair()) === null;
}

/** The timestamps (text form) in a change. */
export function hlcTexts(change: ContentChange): string[] {
  return change.op === "upsert"
    ? Object.values(change.fields).map((field) => field.hlc)
    : [change.hlc];
}
