import { decryptEnvelope } from "@parapka/crypto";
import {
  MAX_ENVELOPE_BYTES,
  validateEnvelope,
  type ContentChange,
  type Envelope,
} from "@parapka/protocol";
import { expect, it } from "vitest";

import { RelayError } from "../net/relay-error";
import { createHandlerRegistry } from "./handler-registry";
import { queueChanges } from "./outbound";
import { createPairHandler } from "./pair-handler";
import { createPairedDevices } from "./sync-test-support";
import type { SyncTransport } from "./transport";
import { vi } from "vitest";

const command = (stamp: () => string) =>
  ({
    entity: "Pair",
    id: "pair",
    op: "upsert",
    fields: { command: { value: "disconnect", hlc: stamp() } },
  }) as const;

it("queues the command last, without the consent, and the partner reads it", async () => {
  const { a, b } = await createPairedDevices();
  a.restart({ canSync: () => false });
  a.handler.edit("c1", "name", "x");
  await a.database.put("sync-outbox", "0-first", { envelopeId: "0-first" });
  await a.engine.queueCommand(command);
  const ids = (await a.database.list("sync-outbox")).map((r) => r.id);
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe("0-first");

  const onDisconnect = vi.fn(() => Promise.resolve());
  const registry = createHandlerRegistry();
  registry.register(createPairHandler({ onDisconnect }));
  b.restart({ registry });
  await a.database.delete("sync-outbox", "0-first");
  await a.engine.flush(a.transport);
  await b.engine.pull();
  expect(onDisconnect).toHaveBeenCalledTimes(1);
});

it("queues nothing without a pair", async () => {
  const { a } = await createPairedDevices();
  await a.pairs.remove();
  await a.engine.queueCommand(command);
  expect(await a.engine.pending()).toBe(0);
});

it("flush stops at the first error and keeps the rest", async () => {
  const { a } = await createPairedDevices();
  for (const id of ["e1", "e2", "e3"]) {
    await a.database.put("sync-outbox", id, { envelopeId: id });
  }
  const sent: string[] = [];
  const transport = {
    send: (envelope: Envelope) => {
      if (envelope.envelopeId === "e2") {
        return Promise.reject(new RelayError("network"));
      }
      sent.push(envelope.envelopeId);
      return Promise.resolve();
    },
  } as unknown as SyncTransport;
  await expect(a.engine.flush(transport)).rejects.toBeInstanceOf(RelayError);
  expect(sent).toEqual(["e1"]);
  expect((await a.database.list("sync-outbox")).map((r) => r.id)).toEqual([
    "e2",
    "e3",
  ]);
});

it("flush with a mailbox sends only the envelopes of that mailbox", async () => {
  const { a } = await createPairedDevices();
  for (const [id, pairMailboxId] of [
    ["e1", "old"],
    ["e2", "new"],
  ] as const) {
    await a.database.put("sync-outbox", id, { envelopeId: id, pairMailboxId });
  }
  const sent: string[] = [];
  const transport = {
    send: (envelope: Envelope) => {
      sent.push(envelope.envelopeId);
      return Promise.resolve();
    },
  } as unknown as SyncTransport;
  await a.engine.flush(transport, "new");
  expect(sent).toEqual(["e2"]);
  expect((await a.database.list("sync-outbox")).map((r) => r.id)).toEqual([
    "e1",
  ]);
});

const change = (index: number, size: number): ContentChange => ({
  entity: "Chore",
  id: `c${String(index)}`,
  op: "upsert",
  fields: {
    text: {
      value: "x".repeat(size),
      hlc: `h${String(index).padStart(6, "0")}`,
    },
  },
});

async function queue(changes: readonly ContentChange[]) {
  const { a, b, sodium } = await createPairedDevices();
  let counter = 0;
  const context = {
    database: a.database,
    sodium,
    newId: () => `id-${String((counter += 1)).padStart(6, "0")}`,
  };
  const session = {
    pair: { pairMailboxId: "mailbox-1" },
    keys: a.keys,
    deviceId: a.id,
  };
  await queueChanges(context, session, changes);
  const envelopes = (await a.database.list("sync-outbox")).map(
    (r) => r.value as unknown as Envelope,
  );
  const decoded = envelopes.flatMap((e) => {
    const fields = {
      envelopeId: e.envelopeId,
      pairMailboxId: e.pairMailboxId,
      senderDeviceId: e.senderDeviceId,
      protocolVersion: e.protocolVersion,
    };
    const plain = decryptEnvelope(sodium, b.keys.receiveKey, fields, {
      nonce: Uint8Array.from(Buffer.from(e.nonce, "base64")),
      ciphertext: Uint8Array.from(Buffer.from(e.ciphertext, "base64")),
    });
    const content = JSON.parse(new TextDecoder().decode(plain)) as {
      changes: ContentChange[];
    };
    return content.changes;
  });
  return { envelopes, decoded };
}

it("splits a large set into envelopes within the limit, in order", async () => {
  const changes = Array.from({ length: 400 }, (_, i) => change(i, 300));
  const { envelopes, decoded } = await queue(changes);
  expect(envelopes.length).toBeGreaterThanOrEqual(2);
  for (const envelope of envelopes) {
    expect(validateEnvelope(envelope).ok).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(envelope))).toBeLessThanOrEqual(
      MAX_ENVELOPE_BYTES,
    );
  }
  expect(decoded).toEqual(changes);
});

it("keeps a small set in one envelope", async () => {
  const changes = [change(1, 10), change(2, 10), change(3, 10)];
  const { envelopes, decoded } = await queue(changes);
  expect(envelopes).toHaveLength(1);
  expect(decoded).toEqual(changes);
});

it("puts a change above the limit in an envelope of its own", async () => {
  const changes = [change(1, 10), change(2, MAX_ENVELOPE_BYTES), change(3, 10)];
  const { envelopes, decoded } = await queue(changes);
  expect(envelopes).toHaveLength(3);
  expect(decoded).toEqual(changes);
});
