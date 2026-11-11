import { expect, it, vi } from "vitest";

import { RelayError } from "../net/relay-error";
import { createHandlerRegistry } from "../sync/handler-registry";
import { createPairHandler } from "../sync/pair-handler";
import {
  createPairedDevices,
  MAILBOX,
  type Device,
} from "../sync/sync-test-support";
import type { SyncTransport } from "../sync/transport";
import { disconnect, finishClosing } from "./disconnect";

const CLOSING = "pair-closing";

async function setup() {
  const devices = await createPairedDevices();
  const { a } = devices;
  const calls: string[] = [];
  const registry = createHandlerRegistry();
  registry.register({
    entity: "Probe",
    category: null,
    collect: () => Promise.resolve([]),
    apply: () => Promise.resolve(),
    disconnected: () => {
      calls.push("clear");
      return Promise.resolve();
    },
  });
  let transport: SyncTransport = a.transport;
  const base = {
    database: a.database,
    engine: {
      queueCommand: (
        build: Parameters<Device["engine"]["queueCommand"]>[0],
      ) => {
        calls.push("queue");
        return a.engine.queueCommand(build);
      },
      flush: (t: SyncTransport) => {
        calls.push("flush");
        return a.engine.flush(t);
      },
    },
    createTransport: (id: string) => {
      calls.push(`transport:${id}`);
      return transport;
    },
  };
  const deps = {
    ...base,
    pairs: a.pairs,
    stopScheduler: () => calls.push("stop"),
    clearPair: {
      database: a.database,
      registry,
      pairs: a.pairs,
      consent: { clear: () => Promise.resolve() },
    },
  };
  return {
    ...devices,
    calls,
    deps,
    base,
    useTransport: (t: SyncTransport) => {
      transport = t;
    },
  };
}

const failing = (error: Error, real: SyncTransport): SyncTransport => ({
  ...real,
  send: () => Promise.reject(error),
});

it("runs the steps in order and removes the marker", async () => {
  const { calls, deps, a } = await setup();
  const marker: unknown[] = [];
  deps.clearPair.consent = {
    clear: async () => {
      marker.push(await a.database.get(CLOSING, "current"));
    },
  };
  await disconnect(deps);
  expect(calls).toEqual([
    "stop",
    "queue",
    "clear",
    `transport:${MAILBOX}`,
    "flush",
  ]);
  expect(marker).toEqual([{ pairMailboxId: MAILBOX }]);
  expect(await a.database.get(CLOSING, "current")).toBeNull();
  expect(await a.pairs.activePair()).toBeNull();
  expect(await a.engine.pending()).toBe(0);
});

it("does nothing without a pair", async () => {
  const { deps, a, calls } = await setup();
  await a.pairs.remove();
  await disconnect(deps);
  expect(calls).toEqual([]);
});

it("lets the partner read the command and closes the mailbox", async () => {
  const { a, b } = await setup();
  const onDisconnect = vi.fn(() => Promise.resolve());
  const registry = createHandlerRegistry();
  registry.register(createPairHandler({ onDisconnect }));
  b.restart({ registry });
  await a.engine.queueCommand((stamp) => ({
    entity: "Pair",
    id: "pair",
    op: "upsert",
    fields: { command: { value: "disconnect", hlc: stamp() } },
  }));
  await a.engine.flush(a.transport);
  await b.engine.pull();
  expect(onDisconnect).toHaveBeenCalledTimes(1);
  await a.transport.close();
  await expect(b.transport.send(await sampleEnvelope(a))).rejects.toMatchObject(
    { kind: "expired", status: 410 },
  );
});

async function sampleEnvelope(a: Device) {
  await a.engine.queueCommand((stamp) => ({
    entity: "Pair",
    id: "pair",
    op: "upsert",
    fields: { command: { value: "x", hlc: stamp() } },
  }));
  const [record] = await a.database.list("sync-outbox");
  return record?.value as never;
}

it("keeps the marker and the queue when the network fails, then finishes", async () => {
  const { deps, base, a, b, useTransport } = await setup();
  useTransport(failing(new RelayError("network"), a.transport));
  await disconnect(deps);
  expect(await a.database.get(CLOSING, "current")).toEqual({
    pairMailboxId: MAILBOX,
  });
  expect(await a.engine.pending()).toBe(1);
  expect(await a.pairs.activePair()).toBeNull();

  useTransport(a.transport);
  await finishClosing(base);
  expect(await a.database.get(CLOSING, "current")).toBeNull();
  expect(await a.engine.pending()).toBe(0);
  expect((await b.transport.fetch(null)).envelopes).toHaveLength(1);
});

it("finishes closing when the relay answers forbidden or expired", async () => {
  for (const kind of ["forbidden", "expired"] as const) {
    const { deps, a, useTransport } = await setup();
    useTransport(failing(new RelayError(kind, 410), a.transport));
    await disconnect(deps);
    expect(await a.database.get(CLOSING, "current")).toBeNull();
  }
});

it("keeps the marker on an error that is not a relay error", async () => {
  const { deps, a, useTransport } = await setup();
  useTransport(failing(new Error("boom"), a.transport));
  await disconnect(deps);
  expect(await a.database.get(CLOSING, "current")).not.toBeNull();
});

it("finishClosing does nothing without a marker", async () => {
  const { base, calls } = await setup();
  await finishClosing(base);
  expect(calls).toEqual([]);
});
