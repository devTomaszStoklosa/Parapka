import type { Envelope } from "@parapka/protocol";

import type { LocalDatabase } from "../data/local-database";
import { OUTBOX } from "./engine-state";

async function removeWhere(
  database: LocalDatabase,
  matches: (pairMailboxId: string) => boolean,
): Promise<void> {
  for (const record of await database.list(OUTBOX)) {
    const envelope = record.value as unknown as Envelope;
    if (matches(envelope.pairMailboxId)) {
      await database.delete(OUTBOX, record.id);
    }
  }
}

/** Removes the envelopes of one mailbox, for example one the relay closed. */
export function removeMailboxEnvelopes(
  database: LocalDatabase,
  pairMailboxId: string,
): Promise<void> {
  return removeWhere(database, (id) => id === pairMailboxId);
}

/** Removes the envelopes of every mailbox but the current one. */
export function removeForeignEnvelopes(
  database: LocalDatabase,
  currentMailboxId: string,
): Promise<void> {
  return removeWhere(database, (id) => id !== currentMailboxId);
}
