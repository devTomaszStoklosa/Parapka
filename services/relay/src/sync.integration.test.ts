import { createMemoryDatabase } from "../../../apps/mobile/src/data/memory-database";
import {
  createRelayClient,
  type RelayClient,
  type RelayFetch,
} from "../../../apps/mobile/src/net/relay-client";
import { createPairRepository } from "../../../apps/mobile/src/pairing/pair-repository";
import { createMemoryKeyStore } from "../../../apps/mobile/src/platform/memory-key-store";
import { webSha256 } from "../../../apps/mobile/src/platform/sha256";
import { createWebSodium } from "../../../apps/mobile/src/platform/web-sodium";
import { createHandlerRegistry } from "../../../apps/mobile/src/sync/handler-registry";
import { createRelayTransport } from "../../../apps/mobile/src/sync/relay-transport";
import { createSyncEngine } from "../../../apps/mobile/src/sync/sync-engine";
import {
  ChoreHandler,
  createTickingClock,
} from "../../../apps/mobile/src/sync/sync-test-support";
import {
  base64urlEncode,
  derivePairKeys,
  type PairKeys,
  type Sodium,
} from "@parapka/crypto";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStore } from "./store/memory-store.js";

let app: FastifyInstance;
let sodium: Sodium;

beforeEach(async () => {
  sodium = await createWebSodium();
  app = buildApp({ store: new MemoryStore(), clock: { nowMs: () => 1e12 } });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

const injectFetch: RelayFetch = async (url, init) => {
  const response = await app.inject({
    method: init.method as "GET",
    url: url.replace("http://relay", ""),
    headers: init.headers,
    ...(init.body === undefined ? {} : { payload: init.body }),
  });
  return {
    status: response.statusCode,
    text: () => Promise.resolve(response.body),
  };
};

async function newClient(): Promise<{ client: RelayClient; deviceId: string }> {
  const keys = sodium.signKeyPair();
  const options = {
    baseUrl: "http://relay",
    fetch: injectFetch,
    sodium,
    sha256: webSha256,
  };
  const { deviceId } = await createRelayClient(options).registerDevice(
    base64urlEncode(keys.publicKey),
  );
  const client = createRelayClient({
    ...options,
    credentials: { deviceId, signingPrivateKey: keys.privateKey },
  });
  return { client, deviceId };
}

async function newDevice(
  client: RelayClient,
  deviceId: string,
  pairMailboxId: string,
  keys: PairKeys,
) {
  const database = createMemoryDatabase();
  const pairs = createPairRepository(database, createMemoryKeyStore());
  await pairs.savePending(
    {
      pairMailboxId,
      deviceId: null,
      signingPublicKey: "signing",
      agreementPublicKey: "agreement",
    },
    keys,
  );
  await pairs.confirm();
  const handler = new ChoreHandler();
  const registry = createHandlerRegistry();
  registry.register(handler);
  const transport = createRelayTransport({
    client,
    pairMailboxId,
    createSocket: () => {
      throw new Error("no socket in this test");
    },
  });
  const engine = createSyncEngine({
    database,
    pairs,
    identity: { deviceId: () => Promise.resolve(deviceId) },
    sodium,
    clock: createTickingClock(),
    transport,
    registry,
  });
  return { client, handler, engine };
}

async function pairedDevices() {
  const a = await newClient();
  const b = await newClient();
  const { invitationId } = await a.client.createInvitation();
  const { pairMailboxId } = await b.client.acceptInvitation(
    invitationId,
    "SEALED",
  );
  const aKeys = sodium.kxKeyPair();
  const bKeys = sodium.kxKeyPair();
  return {
    pairMailboxId,
    a: await newDevice(
      a.client,
      a.deviceId,
      pairMailboxId,
      derivePairKeys(sodium, "inviter", aKeys, bKeys.publicKey),
    ),
    b: await newDevice(
      b.client,
      b.deviceId,
      pairMailboxId,
      derivePairKeys(sodium, "acceptor", bKeys, aKeys.publicKey),
    ),
  };
}

it("moves a change from device A to device B through the relay", async () => {
  const { a, b, pairMailboxId } = await pairedDevices();
  a.handler.edit("c1", "title", "Dishes");
  await a.engine.sync();
  expect(await a.engine.pending()).toBe(0);

  await b.engine.sync();
  expect(b.handler.snapshot()).toEqual({ c1: { title: "Dishes" } });
  expect(b.handler.applied).toBe(1);

  // A second pull does not apply the change again.
  await b.engine.pull();
  expect(b.handler.applied).toBe(1);

  // After the acknowledgement the relay holds no envelopes.
  const left = await b.client.fetchEnvelopes(pairMailboxId, null);
  expect(left.envelopes).toEqual([]);
});
