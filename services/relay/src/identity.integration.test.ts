import { createMemoryDatabase } from "../../../apps/mobile/src/data/memory-database";
import { createIdentity } from "../../../apps/mobile/src/identity/identity";
import { createRelayClient } from "../../../apps/mobile/src/net/relay-client";
import type { RelayFetch } from "../../../apps/mobile/src/net/relay-client";
import { createMemoryKeyStore } from "../../../apps/mobile/src/platform/memory-key-store";
import { webSha256 } from "../../../apps/mobile/src/platform/sha256";
import { createWebSodium } from "../../../apps/mobile/src/platform/web-sodium";
import type { Sodium } from "@parapka/crypto";
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

/** A fetch backed by `app.inject`. */
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

function newIdentity(fetch: RelayFetch) {
  return createIdentity({
    sodium,
    keyStore: createMemoryKeyStore(),
    database: createMemoryDatabase(),
    relay: () =>
      createRelayClient({
        baseUrl: "http://relay",
        fetch,
        sodium,
        sha256: webSha256,
      }),
  });
}

it("registers the device and signs requests with its credentials", async () => {
  const identity = newIdentity(injectFetch);
  expect(await identity.init()).toBe("registered");
  const credentials = await identity.credentials();
  if (!credentials) throw new Error("no credentials");
  const client = createRelayClient({
    baseUrl: "http://relay",
    fetch: injectFetch,
    sodium,
    sha256: webSha256,
    credentials: credentials,
  });
  const invitation = await client.createInvitation();
  expect(invitation.invitationId).not.toBe("");
});

it("waits for the network and registers on the next try", async () => {
  let online = false;
  const identity = newIdentity((url, init) =>
    online ? injectFetch(url, init) : Promise.reject(new Error("offline")),
  );
  expect(await identity.init()).toBe("waitingForNetwork");
  expect(await identity.credentials()).toBeNull();
  online = true;
  expect(await identity.ensureRegistered()).toBe("registered");
  expect(await identity.deviceId()).not.toBeNull();
});
