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
import { deleteAllData } from "../../../apps/mobile/src/data-control/delete-all";
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
import { derivePairKeys, type PairKeys, type Sodium } from "@parapka/crypto";
import type { Envelope } from "@parapka/protocol";
import type { FastifyInstance, FastifyServerOptions } from "fastify";
import { expect } from "vitest";
import { buildApp } from "./app.js";
import type { RelayStore } from "./store/store.js";

const profile = (name: string) =>
  ({
    name,
    form: "feminine",
    goals: [],
    shareGoalsWithPartner: false,
  }) as unknown as Profile;

interface World {
  readonly sodium: Sodium;
  readonly app: FastifyInstance;
  // Devices without network, by their name.
  readonly offline: Set<string>;
  // Every envelope that reached the relay.
  readonly sent: Envelope[];
}

// The fetch of one device: it reaches the app unless the device is offline.
const injectFetch =
  (world: World, name: string): RelayFetch =>
  async (url, init) => {
    if (world.offline.has(name)) throw new TypeError("offline");
    if (init.method === "POST" && url.endsWith("/envelopes")) {
      const body = JSON.parse(init.body ?? "{}") as { envelope: Envelope };
      world.sent.push(body.envelope);
    }
    const response = await world.app.inject({
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

// The identity, the registered client and the repositories of one phone.
async function phoneOf(world: World, name: string) {
  const database = createMemoryDatabase();
  const keyStore = createMemoryKeyStore();
  const options = {
    baseUrl: "http://relay",
    fetch: injectFetch(world, name),
    sodium: world.sodium,
    sha256: webSha256,
  };
  const identity = createIdentity({
    sodium: world.sodium,
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
  return {
    database,
    keyStore,
    identity,
    credentials,
    client,
    profiles,
    consent,
    partner: createPartnerProfileRepository(database),
    pairs: createPairRepository(database, keyStore),
    disconnected: createDisconnectRepository(database),
  };
}

type Phone = Awaited<ReturnType<typeof phoneOf>>;

function registryOf(phone: Phone) {
  const { database, profiles, partner, consent, pairs, disconnected } = phone;
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
  return registry;
}

// Confirms a pair, saves the consent and starts an engine for its mailbox.
function connectorOf(world: World, name: string, phone: Phone) {
  const { database, identity, pairs, consent } = phone;
  const registry = registryOf(phone);
  const transportOf = (pairMailboxId: string) =>
    createRelayTransport({
      client: phone.client,
      pairMailboxId,
      createSocket: expect.unreachable.bind(expect, "no socket in this test"),
    });
  // The engine of the current pair; a new pair makes a new one.
  let engine: SyncEngine | null = null;
  const current = (): SyncEngine => {
    if (engine === null) throw new Error("There is no pair");
    return engine;
  };
  const connect = async (pairMailboxId: string, keys: PairKeys) => {
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
      sodium: world.sodium,
      clock: createTickingClock(),
      transport: transportOf(pairMailboxId),
      registry,
      canSync: () => consent.canSync(),
      isShared: consent.isShared.bind(consent),
    });
  };
  return { registry, transportOf, current, connect };
}

async function newDevice(world: World, name: string) {
  const phone = await phoneOf(world, name);
  const { database, pairs, consent } = phone;
  const { registry, transportOf, current, connect } = connectorOf(
    world,
    name,
    phone,
  );
  const closing = {
    database,
    engine: {
      flush: (...args: Parameters<SyncEngine["flush"]>) =>
        current().flush(...args),
    },
    createTransport: transportOf,
  };
  return {
    name,
    ...phone,
    deviceId: phone.credentials.deviceId,
    sync: () => current().sync(),
    pull: () => current().pull(),
    connect,
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
}

export type Device = Awaited<ReturnType<typeof newDevice>>;

// A new pair of the two devices: invitation, mailbox and fresh keys.
async function pair(world: World, a: Device, b: Device) {
  const { sodium } = world;
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
async function resend(world: World, device: Device, pairMailboxId: string) {
  const envelope = world.sent.find(
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

// "Delete all my data" of the device, through the real `deleteAllData`.
export const deleteAllOf = (device: Device) =>
  deleteAllData({
    database: device.database,
    keyStore: device.keyStore,
    pairs: device.pairs,
    disconnect: () => device.disconnect(),
    credentials: () => device.identity.credentials(),
    client: () => device.client,
  });

/** Real clients of the mobile app on a relay app with the given store. */
export async function createPairWorld(options: {
  store: RelayStore;
  logger?: FastifyServerOptions["logger"];
}) {
  const app = buildApp({
    store: options.store,
    clock: { nowMs: () => 1e12 },
    ...(options.logger === undefined ? {} : { logger: options.logger }),
  });
  await app.ready();
  const world: World = {
    sodium: await createWebSodium(),
    app,
    offline: new Set(),
    sent: [],
  };
  return {
    ...world,
    newDevice: (name: string) => newDevice(world, name),
    pair: (a: Device, b: Device) => pair(world, a, b),
    resend: (device: Device, pairMailboxId: string) =>
      resend(world, device, pairMailboxId),
    exchangeProfiles,
    expectEndedByPartner,
  };
}

export type PairWorld = Awaited<ReturnType<typeof createPairWorld>>;
