import {
  base64urlEncode,
  computeSafetyCode,
  decodeInvitation,
  derivePairKeys,
  encryptAcceptorKeys,
  generateDeviceKeys,
  encodeDevicePublicKeys,
  type Sodium,
} from "@parapka/crypto";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createMemoryDatabase } from "../../../apps/mobile/src/data/memory-database";
import { createIdentity } from "../../../apps/mobile/src/identity/identity";
import { createRelayClient } from "../../../apps/mobile/src/net/relay-client";
import type { RelayFetch } from "../../../apps/mobile/src/net/relay-client";
import { createInviter } from "../../../apps/mobile/src/pairing/inviter";
import { createPairRepository } from "../../../apps/mobile/src/pairing/pair-repository";
import { createMemoryKeyStore } from "../../../apps/mobile/src/platform/memory-key-store";
import { webSha256 } from "../../../apps/mobile/src/platform/sha256";
import { createWebSodium } from "../../../apps/mobile/src/platform/web-sodium";
import { buildApp } from "./app.js";
import { MemoryStore } from "./store/memory-store.js";

let app: FastifyInstance;
let sodium: Sodium;
let nowMs: number;
let requests = 0;

beforeEach(async () => {
  sodium = await createWebSodium();
  nowMs = 1e12;
  app = buildApp({ store: new MemoryStore(), clock: { nowMs: () => nowMs } });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

/** A fetch backed by `app.inject`. */
const injectFetch: RelayFetch = async (url, init) => {
  requests += 1;
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

const client = (
  credentials?: Parameters<typeof createRelayClient>[0]["credentials"],
) =>
  createRelayClient({
    baseUrl: "http://relay",
    fetch: injectFetch,
    sodium,
    sha256: webSha256,
    ...(credentials ? { credentials } : {}),
  });

async function sideA() {
  const keyStore = createMemoryKeyStore();
  const database = createMemoryDatabase();
  const identity = createIdentity({
    sodium,
    keyStore,
    database,
    relay: () => client(),
  });
  await identity.init();
  const pairs = createPairRepository(database, keyStore);
  const inviter = createInviter({
    sodium,
    keyStore,
    clock: { nowMs: () => nowMs },
    identity,
    pairs,
    relay: client,
    appUrl: "https://app.example",
  });
  return { identity, keyStore, pairs, inviter };
}

/** Device B: registers, accepts the invitation from the link text. */
async function sideBAccepts(link: string) {
  const keys = generateDeviceKeys(sodium);
  const text = encodeDevicePublicKeys({
    signing: keys.signing.publicKey,
    agreement: keys.agreement.publicKey,
  });
  const { deviceId } = await client().registerDevice(text.signing);
  const invitation = decodeInvitation(new URL(link).hash.slice(1));
  const encrypted = encryptAcceptorKeys(
    sodium,
    invitation.secret,
    invitation.invitationId,
    { signing: keys.signing.publicKey, agreement: keys.agreement.publicKey },
  );
  await client({
    deviceId,
    signingPrivateKey: keys.signing.privateKey,
  }).acceptInvitation(
    invitation.invitationId,
    `${base64urlEncode(encrypted.nonce)}.${base64urlEncode(encrypted.ciphertext)}`,
  );
  const pairKeys = derivePairKeys(
    sodium,
    "acceptor",
    keys.agreement,
    invitation.publicKeys.agreement,
  );
  const safetyCode = computeSafetyCode(
    sodium,
    { signing: keys.signing.publicKey, agreement: keys.agreement.publicKey },
    invitation.publicKeys,
  );
  return { deviceId, pairKeys, safetyCode };
}

it("pairs A with a simulated B and both show the same safety code", async () => {
  const a = await sideA();
  const started = await a.inviter.start();
  if (started.status !== "created") throw new Error(started.status);
  const { invitation } = started;
  expect(invitation.link.startsWith("https://app.example/pair#v1.")).toBe(true);
  expect(invitation.expiresAtMs).toBeGreaterThan(nowMs);

  expect(await a.inviter.poll(invitation)).toEqual({ status: "waiting" });

  const b = await sideBAccepts(invitation.link);
  const accepted = await a.inviter.poll(invitation);
  if (accepted.status !== "accepted") throw new Error(accepted.status);
  expect(accepted.safetyCode).toMatch(/^\d{6}$/);
  expect(accepted.safetyCode).toBe(b.safetyCode);
  expect(await a.inviter.pendingSafetyCode()).toBe(b.safetyCode);

  // Not used by sync before the confirmation.
  expect((await a.pairs.get())?.state).toBe("pending-confirmation");
  expect(await a.pairs.active()).toBeNull();
  await a.pairs.confirm();
  const active = await a.pairs.active();
  expect(active?.record.partnerDeviceId).toBe(b.deviceId);
  expect(active?.keys.sendKey).toEqual(b.pairKeys.receiveKey);
  expect(active?.keys.receiveKey).toEqual(b.pairKeys.sendKey);
});

it("removes the pair and its keys when the codes differ", async () => {
  const a = await sideA();
  const started = await a.inviter.start();
  if (started.status !== "created") throw new Error(started.status);
  await sideBAccepts(started.invitation.link);
  await a.inviter.poll(started.invitation);
  await a.pairs.reject();
  expect(await a.pairs.get()).toBeNull();
  expect(await a.pairs.active()).toBeNull();
  expect(await a.keyStore.get("pair/send-key")).toBeNull();
  expect(await a.keyStore.get("pair/receive-key")).toBeNull();
  expect(await a.inviter.pendingSafetyCode()).toBeNull();
});

it("does not call the relay for a person who is already in a pair", async () => {
  const a = await sideA();
  const started = await a.inviter.start();
  if (started.status !== "created") throw new Error(started.status);
  await sideBAccepts(started.invitation.link);
  await a.inviter.poll(started.invitation);
  const before = requests;
  expect(await a.inviter.start()).toEqual({ status: "alreadyPaired" });
  expect(requests).toBe(before);
});

it("reports an invitation that expired after 24 hours", async () => {
  const a = await sideA();
  const started = await a.inviter.start();
  if (started.status !== "created") throw new Error(started.status);
  nowMs += 24 * 60 * 60 * 1000;
  expect(await a.inviter.poll(started.invitation)).toEqual({
    status: "expired",
  });
});
