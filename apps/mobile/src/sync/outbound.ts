import { encryptEnvelope, type Sodium } from "@parapka/crypto";
import {
  MAX_ENVELOPE_BYTES,
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

/** Bytes of an envelope id; ids are UUIDs, the margin covers longer ones. */
const ID_MARGIN = 64;
const NONCE_BYTES = 24;
const MAC_BYTES = 16;
const CONTENT_WRAPPER = JSON.stringify({
  schemaVersion: SUPPORTED_SCHEMA_VERSION,
  changes: [],
}).length;

const byteLength = (text: string): number => encoder.encode(text).length;

/** Envelope size without the ciphertext: header fields, nonce and the quotes. */
function headerBytes(session: OutboundSession): number {
  return (
    byteLength(
      JSON.stringify({
        envelopeId: "",
        pairMailboxId: session.pair.pairMailboxId,
        senderDeviceId: session.deviceId,
        protocolVersion: PROTOCOL_VERSION,
        nonce: "A".repeat(Math.ceil(NONCE_BYTES / 3) * 4),
        ciphertext: "",
      }),
    ) + ID_MARGIN
  );
}

/**
 * Splits the changes, in order, into batches whose envelopes fit the limit. A
 * change that does not fit alone gets a batch of its own.
 */
function splitChanges(
  session: OutboundSession,
  changes: readonly ContentChange[],
): ContentChange[][] {
  const base = headerBytes(session);
  const batches: ContentChange[][] = [];
  let batch: ContentChange[] = [];
  let contentBytes = CONTENT_WRAPPER;
  for (const change of changes) {
    const added = byteLength(JSON.stringify(change)) + 1;
    const total = base + 4 * Math.ceil((contentBytes + added + MAC_BYTES) / 3);
    if (batch.length > 0 && total > MAX_ENVELOPE_BYTES) {
      batches.push(batch);
      batch = [];
      contentBytes = CONTENT_WRAPPER;
    }
    batch.push(change);
    contentBytes += added;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

async function queueBatch(
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
 * Encrypts the changes with the sending key and appends them to the queue, one
 * envelope per batch of at most `MAX_ENVELOPE_BYTES`; the order is kept.
 */
export async function queueChanges(
  context: OutboundContext,
  session: OutboundSession,
  changes: readonly ContentChange[],
): Promise<void> {
  for (const batch of splitChanges(session, changes)) {
    await queueBatch(context, session, batch);
  }
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
