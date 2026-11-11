import { defaultConsent } from "../../../apps/mobile/src/consent/consent-model";
import { createConsentRepository } from "../../../apps/mobile/src/consent/consent-repository";
import { createMemoryDatabase } from "../../../apps/mobile/src/data/memory-database";
import type { Profile } from "../../../apps/mobile/src/data/profile";
import { createProfileRepository } from "../../../apps/mobile/src/data/profile-repository";
import { createIdentity } from "../../../apps/mobile/src/identity/identity";
import {
  createRelayClient,
  type DeviceCredentials,
  type RelayFetch,
} from "../../../apps/mobile/src/net/relay-client";
import { clearPairLocally } from "../../../apps/mobile/src/pairing/clear-pair";
import {
  disconnect,
  finishClosing,
} from "../../../apps/mobile/src/pairing/disconnect";
import { createDisconnectRepository } from "../../../apps/mobile/src/pairing/disconnect-repository";
import { createPairRepository } from "../../../apps/mobile/src/pairing/pair-repository";
import { createMemoryKeyStore } from "../../../apps/mobile/src/platform/memory-key-store";
import { webSha256 } from "../../../apps/mobile/src/platform/sha256";
import { createWebSodium } from "../../../apps/mobile/src/platform/web-sodium";
import { base64Decode } from "../../../apps/mobile/src/sync/base64";
import { createHandlerRegistry } from "../../../apps/mobile/src/sync/handler-registry";
import { createPairHandler } from "../../../apps/mobile/src/sync/pair-handler";
import { createPartnerProfileRepository } from "../../../apps/mobile/src/sync/partner-profile-repository";
import { createProfileHandler } from "../../../apps/mobile/src/sync/profile-handler";
import { createRelayTransport } from "../../../apps/mobile/src/sync/relay-transport";
import {
  createSyncEngine,
  type SyncEngine,
} from "../../../apps/mobile/src/sync/sync-engine";
import { createTickingClock } from "../../../apps/mobile/src/sync/sync-test-support";
import {
  decryptEnvelope,
  derivePairKeys,
  type PairKeys,
  type Sodium,
} from "@parapka/crypto";
import type { Envelope } from "@parapka/protocol";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStore } from "./store/memory-store.js";

let app: FastifyInstance;
let sodium: Sodium;
// Devices without network, by their name.
let offline: Set<string>;
// Every envelope that reached the relay.
let sent: Envelope[];

beforeEach(async () => {
  sodium = await createWebSodium();
  app = buildApp({ store: new MemoryStore(), clock: { nowMs: () => 1e12 } });
  await app.ready();
  offline = new Set();
  sent = [];
});

afterEach(async () => {
  await app.close();
});

// The fetch of one device: it reaches the app unless the device is offline.
const injectFetch =
  (name: string): RelayFetch =>
  async (url, init) => {
    if (offline.has(name)) throw new TypeError("offline");
    if (init.method === "POST" && url.endsWith("/envelopes")) {
      const body = JSON.parse(init.body ?? "{}") as { envelope: Envelope };
      sent.push(body.envelope);
    }
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

const profile = (name: string) =>
  ({
    name,
    form: "feminine",
    goals: [],
    shareGoalsWithPartner: false,
  }) as unknown as Profile;

async function newDevice(name: string) {
  const database = createMemoryDatabase();
  const keyStore = createMemoryKeyStore();
  const options = {
    baseUrl: "http://relay",
    fetch: injectFetch(name),
    sodium,
    sha256: webSha256,
  };
  const identity = createIdentity({
    sodium,
    keyStore,
    database,
    relay: () => createRelayClient(options),
  });
  await identity.init();
  const credentials = (await identity.credentials()) as DeviceCredentials;
  const client = createRelayClient({ ...options, credentials });
  const profiles = createProfileRepository(database);
  await profiles.save(profile(name));
  const consent = createConsentRepository({
    database,
    clock: createTickingClock(),
    profiles,
  });
  const partner = createPartnerProfileRepository(database);
  const pairs = createPairRepository(database, keyStore);
  const disconnected = createDisconnectRepository(database);

  const registry = createHandlerRegistry();
  registry.register(
    createProfileHandler({ database, profiles, partner, consent }),
  );
  registry.register(
    createPairHandler({
      onDisconnect: async () => {
        await clearPairLocally({ database, registry, pairs, consent });
        await disconnected.markByPartner();
      },
    }),
  );
  const noSocket = () => {
    throw new Error("no socket in this test");
  };
  const transportOf = (pairMailboxId: string) =>
    createRelayTransport({
      client,
      pairMailboxId,
      createSocket: noSocket,
    });

  // The engine of the current pair; a new pair makes a new one.
  let engine: SyncEngine | null = null;
  const current = (): SyncEngine => {
    if (engine === null) throw new Error("There is no pair");
    return engine;
  };
  const closing = {
    database,
    engine: {
      flush: (...args: Parameters<SyncEngine["flush"]>) =>
        current().flush(...args),
    },
    createTransport: transportOf,
  };
  const device = {
    name,
    database,
    client,
    pairs,
    partner,
    consent,
    disconnected,
    deviceId: credentials.deviceId,
    sync: () => current().sync(),
    pull: () => current().pull(),
    // Confirms a pair, saves the consent and starts an engine for its mailbox.
    async connect(pairMailboxId: string, keys: PairKeys) {
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
      await consent.save(defaultConsent(profile(name)));
      engine = createSyncEngine({
        database,
        pairs,
        identity,
        sodium,
        clock: createTickingClock(),
        transport: transportOf(pairMailboxId),
        registry,
        canSync: () => consent.canSync(),
        isShared: (category) => consent.isShared(category),
      });
    },
    disconnect: () =>
      disconnect({
        ...closing,
        pairs,
        engine: current(),
        clearPair: { database, registry, pairs, consent },
        stopScheduler: () => undefined,
      }),
    finishClosing: () => finishClosing(closing),
  };
  return device;
}

type Device = Awaited<ReturnType<typeof newDevice>>;

// A new pair of the two devices: invitation, mailbox and fresh keys.
async function pair(a: Device, b: Device) {
  const { invitationId } = await a.client.createInvitation();
  const { pairMailboxId } = await b.client.acceptInvitation(
    invitationId,
    "SEALED",
  );
  const aKeys = sodium.kxKeyPair();
  const bKeys = sodium.kxKeyPair();
  const keys = {
    a: derivePairKeys(sodium, "inviter", aKeys, bKeys.publicKey),
    b: derivePairKeys(sodium, "acceptor", bKeys, aKeys.publicKey),
  };
  await a.connect(pairMailboxId, keys.a);
  await b.connect(pairMailboxId, keys.b);
  return { pairMailboxId, keys };
}

// Both devices have the profile of the other one.
async function exchangeProfiles(a: Device, b: Device) {
  for (const device of [a, b, a]) await device.sync();
  expect(await a.partner.get()).toMatchObject({ name: "b" });
  expect(await b.partner.get()).toMatchObject({ name: "a" });
}

// What the relay answers when the device sends its own old envelope again.
async function resend(device: Device, pairMailboxId: string) {
  const envelope = sent.find(
    (e) =>
      e.pairMailboxId === pairMailboxId && e.senderDeviceId === device.deviceId,
  ) as Envelope;
  try {
    await device.client.sendEnvelope(pairMailboxId, envelope);
    return null;
  } catch (error) {
    return error;
  }
}

// The command reaches B, which ends the pair on its side.
async function expectEndedByPartner(device: Device) {
  await device.pull();
  expect(await device.disconnected.state()).toBe("by-partner");
  expect(await device.partner.get()).toBeNull();
  expect(await device.pairs.current()).toBeNull();
}

async function expectEndedHere(device: Device) {
  expect(await device.pairs.current()).toBeNull();
  expect(await device.pairs.keys()).toBeNull();
  expect(await device.partner.get()).toBeNull();
  expect(await device.consent.current()).toBeNull();
  expect(await device.disconnected.state()).toBe("none");
}

const marker = (device: Device) =>
  device.database.get("pair-closing", "current");

it("disconnects online: B ends by-partner and the mailbox is closed", async () => {
  const a = await newDevice("a");
  const b = await newDevice("b");
  const { pairMailboxId } = await pair(a, b);
  await exchangeProfiles(a, b);

  await a.disconnect();
  await expectEndedHere(a);
  expect(await marker(a)).toBeNull();
  expect(await resend(b, pairMailboxId)).toMatchObject({
    kind: "expired",
    status: 410,
  });

  await expectEndedByPartner(b);
});

it("disconnects offline: A loses data at once, the relay learns later", async () => {
  const a = await newDevice("a");
  const b = await newDevice("b");
  const { pairMailboxId } = await pair(a, b);
  await exchangeProfiles(a, b);

  offline.add("a");
  await a.disconnect();
  await expectEndedHere(a);
  expect(await marker(a)).toEqual({ pairMailboxId });
  expect(await resend(b, pairMailboxId)).toBeNull();

  offline.delete("a");
  expect(await a.finishClosing()).toBe(true);
  expect(await marker(a)).toBeNull();
  expect(await resend(b, pairMailboxId)).toMatchObject({ status: 410 });

  await expectEndedByPartner(b);
});

it("reconnects the same people with new keys and default consents", async () => {
  const a = await newDevice("a");
  const b = await newDevice("b");
  const first = await pair(a, b);
  await exchangeProfiles(a, b);
  const old = sent.filter((e) => e.pairMailboxId === first.pairMailboxId);
  expect(old.length).toBeGreaterThan(0);

  await a.disconnect();
  await expectEndedByPartner(b);
  await b.disconnected.acknowledge();
  expect(await a.consent.current()).toBeNull();
  expect(await b.consent.current()).toBeNull();

  const second = await pair(a, b);
  expect(second.pairMailboxId).not.toBe(first.pairMailboxId);
  expect(second.keys.b.receiveKey).not.toEqual(first.keys.b.receiveKey);
  await exchangeProfiles(a, b);

  for (const envelope of old) {
    expect(() =>
      decryptEnvelope(sodium, second.keys.b.receiveKey, envelope, {
        nonce: base64Decode(envelope.nonce),
        ciphertext: base64Decode(envelope.ciphertext),
      }),
    ).toThrow();
  }
  const fresh = sent.filter((e) => e.pairMailboxId === second.pairMailboxId);
  expect(fresh.length).toBeGreaterThan(0);
});
