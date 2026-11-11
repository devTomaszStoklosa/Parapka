import { describe, expect, it } from "vitest";

import type { JsonValue } from "../data/local-database";
import { createHandlerRegistry } from "./handler-registry";
import {
  ChoreHandler,
  createPairedDevices,
  type Device,
} from "./sync-test-support";
import type { SyncTransport } from "./transport";

/** Delivers the envelopes in reverse order, each of them twice. */
function shuffling(transport: SyncTransport): SyncTransport {
  return {
    ...transport,
    fetch: async (after) => {
      const fetched = await transport.fetch(after);
      const reversed = [...fetched.envelopes].reverse();
      return { ...fetched, envelopes: [...reversed, ...reversed] };
    },
  };
}

function failingSend(transport: SyncTransport): SyncTransport {
  return { ...transport, send: () => Promise.reject(new Error("offline")) };
}

async function received(device: Device): Promise<number> {
  return (await device.transport.fetch(null)).envelopes.length;
}

describe("SyncEngine exchange", () => {
  it("moves changes between two devices both ways", async () => {
    const { a, b } = await createPairedDevices();
    a.handler.edit("c1", "title", "Dishes");
    await a.engine.sync();
    await b.engine.sync();
    expect(b.handler.snapshot()).toEqual({ c1: { title: "Dishes" } });

    b.handler.edit("c1", "title", "Laundry");
    b.handler.edit("c2", "title", "Trash");
    await b.engine.sync();
    await a.engine.sync();
    expect(a.handler.snapshot()).toEqual(b.handler.snapshot());
    expect(a.handler.snapshot().c1).toEqual({ title: "Laundry" });
  });

  it("sends nothing when there is nothing to send", async () => {
    const { a, b } = await createPairedDevices();
    await a.engine.sync();
    expect(await received(b)).toBe(0);
    expect(await a.engine.pending()).toBe(0);
  });

  it("acknowledges what it received", async () => {
    const { a, b } = await createPairedDevices();
    a.handler.edit("c1", "title", "Dishes");
    await a.engine.push();
    expect(await received(b)).toBe(1);
    await b.engine.pull();
    expect(await received(b)).toBe(0);
  });

  it("reaches the same state in any order and with repeats", async () => {
    const { a, b } = await createPairedDevices();
    a.handler.edit("c1", "title", "First");
    await a.engine.push();
    a.handler.edit("c1", "title", "Second");
    a.handler.edit("c2", "title", "Other");
    await a.engine.push();
    a.handler.remove("c2");
    await a.engine.push();

    const engine = b.restart({ transport: shuffling(b.transport) });
    await engine.pull();
    await engine.pull();
    expect(b.handler.snapshot()).toEqual(a.handler.snapshot());
    expect(b.handler.snapshot()).toEqual({ c1: { title: "Second" } });
    expect(b.handler.applied).toBe(4);
  });

  it("keeps the queue over a restart", async () => {
    const { a, b } = await createPairedDevices();
    a.handler.edit("c1", "title", "Dishes");
    const offline = a.restart({ transport: failingSend(a.transport) });
    await expect(offline.push()).rejects.toThrow("offline");
    expect(await offline.pending()).toBe(1);

    const restarted = a.restart();
    expect(await restarted.pending()).toBe(1);
    await restarted.push();
    expect(await restarted.pending()).toBe(0);
    await b.engine.pull();
    expect(b.handler.snapshot()).toEqual({ c1: { title: "Dishes" } });
  });

  it("keeps the cursor over a restart", async () => {
    const { a, b } = await createPairedDevices();
    a.handler.edit("c1", "title", "Dishes");
    await a.engine.push();
    await b.engine.pull();
    await b.restart().pull();
    expect(b.handler.applied).toBe(1);
  });

  it("encrypts the content in the queue", async () => {
    const { a } = await createPairedDevices();
    a.handler.edit("c1", "title", "Dishes");
    await a
      .restart({ transport: failingSend(a.transport) })
      .push()
      .catch(() => undefined);
    const [queued] = await a.database.list("sync-outbox");
    expect(JSON.stringify(queued)).not.toContain("Dishes");
    expect(queued?.value).toMatchObject({
      pairMailboxId: "mailbox-1",
      senderDeviceId: "device-a",
      protocolVersion: 1,
    });
  });
});

describe("SyncEngine gates", () => {
  it("does nothing without a confirmed pair", async () => {
    const { a, b } = await createPairedDevices();
    a.handler.edit("c1", "title", "Dishes");
    await a.engine.push();
    await b.pairs.remove();
    await b.engine.pull();
    expect(b.handler.applied).toBe(0);

    await a.pairs.remove();
    a.handler.edit("c2", "title", "Trash");
    await a.engine.push();
    expect(await a.engine.pending()).toBe(0);
    expect(await received(b)).toBe(1);
  });

  it("does nothing without a device id", async () => {
    const { a } = await createPairedDevices();
    a.handler.edit("c1", "title", "Dishes");
    const engine = a.restart({
      identity: { deviceId: () => Promise.resolve(null) },
    });
    await engine.push();
    expect(await engine.pending()).toBe(0);
  });

  it("does nothing while canSync is false", async () => {
    const { a, b } = await createPairedDevices();
    a.handler.edit("c1", "title", "Dishes");
    await a.engine.push();
    const blocked = b.restart({ canSync: () => false });
    await blocked.pull();
    expect(b.handler.applied).toBe(0);
    await b.restart().pull();
    expect(b.handler.applied).toBe(1);
  });

  it("neither collects nor applies a category that is not shared", async () => {
    const { a, b } = await createPairedDevices();
    const hints = new ChoreHandler("CYCLE_HINTS");
    const registry = createHandlerRegistry();
    registry.register(hints);
    hints.edit("c1", "title", "Dishes");

    const closed = a.restart({ registry, isShared: () => false });
    await closed.push();
    expect(await received(b)).toBe(0);

    await a.restart({ registry, isShared: () => true }).push();
    expect(await received(b)).toBe(1);
    await b.restart({ registry, isShared: () => false }).pull();
    expect(hints.applied).toBe(0);
    expect(hints.snapshot()).toEqual({ c1: { title: "Dishes" } });
  });

  it("waits for asynchronous consent gates", async () => {
    const { a, b } = await createPairedDevices();
    a.handler.edit("c1", "title", "Dishes");
    await a.restart({ canSync: () => Promise.resolve(false) }).push();
    expect(await received(b)).toBe(0);
    await a.restart({ canSync: () => Promise.resolve(true) }).push();
    expect(await received(b)).toBe(1);

    const hints = new ChoreHandler("CYCLE_HINTS");
    const registry = createHandlerRegistry();
    registry.register(hints);
    hints.edit("c1", "title", "Dishes");
    await a
      .restart({ registry, isShared: () => Promise.resolve(false) })
      .push();
    expect(await received(b)).toBe(1);
    expect(hints.committedCount).toBe(0);
    await a.restart({ registry, isShared: () => Promise.resolve(true) }).push();
    expect(await received(b)).toBe(2);
    await b
      .restart({ registry, isShared: () => Promise.resolve(false) })
      .pull();
    expect(hints.applied).toBe(0);
  });

  it("tells a handler its changes are queued only after the envelope is saved", async () => {
    const { a } = await createPairedDevices();
    a.handler.edit("c1", "title", "Dishes");
    const put = a.database.put.bind(a.database);
    let failing = true;
    Object.assign(a.database, {
      put: (collection: string, id: string, value: JsonValue) =>
        failing && collection === "sync-outbox"
          ? Promise.reject(new Error("disk"))
          : put(collection, id, value),
    });
    await expect(a.engine.push()).rejects.toThrow("disk");
    expect(a.handler.committedCount).toBe(0);
    failing = false;
    a.handler.edit("c2", "title", "Trash");
    await a.engine.push();
    expect(a.handler.committedCount).toBe(1);
  });

  it.each(["CHECKIN", "CYCLE_HINTS"] as const)(
    "keeps the data of %s while paused and sends it after",
    async (category) => {
      const { a, b } = await createPairedDevices();
      const handler = new ChoreHandler(category);
      const registry = createHandlerRegistry();
      registry.register(handler);
      handler.edit("c1", "title", "Mood");

      await a.restart({ registry, isPaused: () => true }).push();
      expect(await received(b)).toBe(0);
      expect(handler.committedCount).toBe(0);

      await a
        .restart({ registry, isPaused: () => Promise.resolve(false) })
        .push();
      expect(await received(b)).toBe(1);
      expect(handler.committedCount).toBe(1);
    },
  );

  it("does not pause the data of other categories", async () => {
    const { a, b } = await createPairedDevices();
    a.handler.edit("c1", "title", "Dishes");
    await a.restart({ isPaused: () => true }).push();
    expect(await received(b)).toBe(1);
  });

  it("queues the same for a day without new data, paused or not", async () => {
    const queue = async (paused: boolean) => {
      const { a } = await createPairedDevices();
      const registry = createHandlerRegistry();
      registry.register(new ChoreHandler("CHECKIN"));
      await a.restart({ registry, isPaused: () => paused }).push();
      return a.database.list("sync-outbox");
    };
    expect(await queue(true)).toEqual(await queue(false));
  });
});

describe("SyncEngine foreign envelopes", () => {
  it("drops the envelopes of another mailbox and sends the rest", async () => {
    const { a, b } = await createPairedDevices();
    await a.database.put("sync-outbox", "old", {
      envelopeId: "old",
      pairMailboxId: "closed-mailbox",
    });
    a.handler.edit("c1", "title", "Dishes");
    await a.engine.push();
    expect(await a.engine.pending()).toBe(0);
    const fetched = await b.transport.fetch(null);
    expect(fetched.envelopes).toHaveLength(1);
  });
});
