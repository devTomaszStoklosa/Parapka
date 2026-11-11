import type { Envelope } from "@parapka/protocol";
import { expect, it } from "vitest";

import { RelayError } from "../net/relay-error";
import { createHandlerRegistry } from "./handler-registry";
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
