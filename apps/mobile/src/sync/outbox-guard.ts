import type { Envelope } from "@parapka/protocol";

import type { LocalDatabase } from "../data/local-database";
import { CLOSING, OUTBOX } from "./engine-state";

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

/**
 * Removes the envelopes of every mailbox but the current one and the one
 * that is being closed: its disconnect command still waits for the network.
 */
export async function removeForeignEnvelopes(
  database: LocalDatabase,
  currentMailboxId: string,
): Promise<void> {
  const marker = await database.get(CLOSING.collection, CLOSING.id);
  const closingId = (marker as { pairMailboxId: string } | null)?.pairMailboxId;
  return removeWhere(
    database,
    (id) => id !== currentMailboxId && id !== closingId,
  );
}
