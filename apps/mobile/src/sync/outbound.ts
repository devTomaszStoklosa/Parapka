import { encryptEnvelope, type Sodium } from "@parapka/crypto";
import {
  PROTOCOL_VERSION,
  SUPPORTED_SCHEMA_VERSION,
  type ContentChange,
  type Envelope,
} from "@parapka/protocol";

import type { JsonValue, LocalDatabase } from "../data/local-database";
import { base64Encode } from "./base64";
import { OUTBOX } from "./engine-state";
import type { SyncTransport } from "./transport";

export interface OutboundContext {
  readonly database: LocalDatabase;
  readonly sodium: Sodium;
  readonly newId: () => string;
}

export interface OutboundSession {
  readonly pair: { readonly pairMailboxId: string };
  readonly keys: { readonly sendKey: Uint8Array };
  readonly deviceId: string;
}

const encoder = new TextEncoder();

/** Encrypts the changes with the sending key and appends them to the queue. */
export async function queueChanges(
  context: OutboundContext,
  session: OutboundSession,
  changes: readonly ContentChange[],
): Promise<void> {
  const fields = {
    envelopeId: context.newId(),
    pairMailboxId: session.pair.pairMailboxId,
    senderDeviceId: session.deviceId,
    protocolVersion: PROTOCOL_VERSION,
  };
  const content = { schemaVersion: SUPPORTED_SCHEMA_VERSION, changes };
  const encrypted = encryptEnvelope(
    context.sodium,
    session.keys.sendKey,
    fields,
    encoder.encode(JSON.stringify(content)),
  );
  const envelope: Envelope = {
    ...fields,
    nonce: base64Encode(encrypted.nonce),
    ciphertext: base64Encode(encrypted.ciphertext),
  };
  await context.database.put(
    OUTBOX,
    fields.envelopeId,
    envelope as unknown as JsonValue,
  );
}

/**
 * Sends the queue in order and removes what was sent; the first error stops it.
 * With `pairMailboxId` only the envelopes of that mailbox are sent.
 */
export async function flushQueue(
  database: LocalDatabase,
  transport: SyncTransport,
  pairMailboxId?: string,
): Promise<void> {
  for (const record of await database.list(OUTBOX)) {
    const envelope = record.value as unknown as Envelope;
    if (
      pairMailboxId !== undefined &&
      envelope.pairMailboxId !== pairMailboxId
    ) {
      continue;
    }
    await transport.send(envelope);
    await database.delete(OUTBOX, record.id);
  }
}
