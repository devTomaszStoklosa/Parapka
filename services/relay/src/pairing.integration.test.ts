import { createMemoryDatabase } from "../../../apps/mobile/src/data/memory-database";
import { createIdentity } from "../../../apps/mobile/src/identity/identity";
import { createRelayClient } from "../../../apps/mobile/src/net/relay-client";
import type { RelayFetch } from "../../../apps/mobile/src/net/relay-client";
import { createAcceptor } from "../../../apps/mobile/src/pairing/acceptor";
import { parseInvitationLink } from "../../../apps/mobile/src/pairing/invitation-link";
import { createInviter } from "../../../apps/mobile/src/pairing/inviter";
import { createPairRepository } from "../../../apps/mobile/src/pairing/pair-repository";
import { createMemoryKeyStore } from "../../../apps/mobile/src/platform/memory-key-store";
import { webSha256 } from "../../../apps/mobile/src/platform/sha256";
import { createWebSodium } from "../../../apps/mobile/src/platform/web-sodium";
import {
  base64urlEncode,
  computeSafetyCode,
  decodeInvitation,
  derivePairKeys,
  encryptAcceptorKeys,
  generateDeviceKeys,
  type Sodium,
} from "@parapka/crypto";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStore } from "./store/memory-store.js";

const NOW = 1e12;
const DAY = 24 * 3_600_000;

let app: FastifyInstance;
let sodium: Sodium;
let now: number;

beforeEach(async () => {
  sodium = await createWebSodium();
  now = NOW;
  app = buildApp({ store: new MemoryStore(), clock: { nowMs: () => now } });
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

const client = (
  credentials?: Parameters<typeof createRelayClient>[0]["credentials"],
  fetch = injectFetch,
) =>
  createRelayClient({
    baseUrl: "http://relay",
    fetch,
    sodium,
    sha256: webSha256,
    ...(credentials ? { credentials } : {}),
  });

/** A device with its own identity, registered on the relay. */
async function newDevice(fetch: RelayFetch = injectFetch) {
  const keyStore = createMemoryKeyStore();
  const database = createMemoryDatabase();
  const identity = createIdentity({
    sodium,
    keyStore,
    database,
    relay: () => client(undefined, fetch),
  });
  await identity.init();
  const credentials = await identity.credentials();
  if (!credentials) throw new Error("no credentials");
  return {
    identity,
    credentials,
    keyStore,
    pairs: createPairRepository(database, keyStore),
  };
}

async function newInviter(fetch: RelayFetch = injectFetch) {
  const a = await newDevice(fetch);
  const inviter = createInviter({
    sodium,
    relay: client(a.credentials, fetch),
    identity: a.identity,
    pairs: a.pairs,
    clock: { nowMs: () => now },
    appUrl: "https://app.example",
  });
  return { ...a, inviter };
}

/** Plays B: accepts the invitation in `link` with real crypto calls. */
async function acceptAsB(link: string) {
  const b = await newDevice();
  const own = await b.identity.publicKeys();
  const agreement = await b.identity.agreementKeyPair();
  if (!own || !agreement) throw new Error("no keys");
  const invitation = decodeInvitation(parseInvitationLink(link) as string);
  const encrypted = encryptAcceptorKeys(
    sodium,
    invitation.secret,
    invitation.invitationId,
    own,
  );
  await client(b.credentials).acceptInvitation(
    invitation.invitationId,
    `${base64urlEncode(encrypted.nonce)}.${base64urlEncode(encrypted.ciphertext)}`,
  );
  return {
    invitation,
    own,
    keys: derivePairKeys(
      sodium,
      "acceptor",
      agreement,
      invitation.publicKeys.agreement,
    ),
    code: computeSafetyCode(sodium, own, invitation.publicKeys),
  };
}

async function createdLink(
  inviter: Awaited<ReturnType<typeof newInviter>>["inviter"],
) {
  const result = await inviter.create();
  if (result.status !== "created") throw new Error("not created");
  return result.link;
}

it("pairs A with B: equal codes and crossed keys", async () => {
  const a = await newInviter();
  const b = await acceptAsB(await createdLink(a.inviter));
  const result = await a.inviter.poll();
  if (result.status !== "accepted") throw new Error(result.status);
  expect(result.safetyCode).toBe(b.code);
  const keys = await a.pairs.keys();
  expect(keys?.sendKey).toEqual(b.keys.receiveKey);
  expect(keys?.receiveKey).toEqual(b.keys.sendKey);
  expect(await a.pairs.activePair()).toBeNull();
  await a.inviter.confirm();
  expect((await a.pairs.activePair())?.state).toBe("confirmed");
});

it("pairs A with a real acceptor B: same mailbox, code and crossed keys", async () => {
  const a = await newInviter();
  const link = await createdLink(a.inviter);
  const bDevice = await newDevice();
  const acceptor = createAcceptor({
    sodium,
    relay: client(bDevice.credentials),
    identity: bDevice.identity,
    pairs: bDevice.pairs,
  });
  const accepted = await acceptor.accept(link);
  const polled = await a.inviter.poll();
  expect(accepted.status).toBe("accepted");
  expect(polled.status).toBe("accepted");
  expect(accepted).toEqual(polled);
  const pairA = await a.pairs.current();
  const pairB = await bDevice.pairs.current();
  expect(pairB).toMatchObject({
    pairMailboxId: pairA?.pairMailboxId,
    deviceId: null,
  });
  const keysA = await a.pairs.keys();
  const keysB = await bDevice.pairs.keys();
  expect(keysA).toEqual({
    sendKey: keysB?.receiveKey,
    receiveKey: keysB?.sendKey,
  });
  await acceptor.confirm();
  expect((await bDevice.pairs.activePair())?.state).toBe("confirmed");
});

it("removes the pair and its keys on rejection", async () => {
  const a = await newInviter();
  await acceptAsB(await createdLink(a.inviter));
  await a.inviter.poll();
  await a.inviter.reject();
  expect(await a.pairs.current()).toBeNull();
  expect(await a.pairs.keys()).toBeNull();
});

it("does not let a paired person invite again (FR-PAIR-09)", async () => {
  const a = await newInviter();
  await acceptAsB(await createdLink(a.inviter));
  await a.inviter.poll();
  expect(await a.inviter.create()).toEqual({ status: "already-paired" });
});

it("expires after 24 h", async () => {
  const a = await newInviter();
  await createdLink(a.inviter);
  now = NOW + DAY + 1;
  expect(await a.inviter.poll()).toEqual({ status: "expired" });
});

it("reports offline when the network is gone", async () => {
  let online = true;
  const a = await newInviter((url, init) =>
    online ? injectFetch(url, init) : Promise.reject(new Error("offline")),
  );
  await createdLink(a.inviter);
  online = false;
  expect(await a.inviter.poll()).toEqual({ status: "offline" });
});

it("returns invalid when B's keys do not decrypt", async () => {
  const a = await newInviter();
  const link = await createdLink(a.inviter);
  const b = await newDevice();
  const invitation = decodeInvitation(parseInvitationLink(link) as string);
  const other = generateDeviceKeys(sodium);
  const encrypted = encryptAcceptorKeys(
    sodium,
    sodium.randomBytes(32),
    invitation.invitationId,
    { signing: other.signing.publicKey, agreement: other.agreement.publicKey },
  );
  await client(b.credentials).acceptInvitation(
    invitation.invitationId,
    `${base64urlEncode(encrypted.nonce)}.${base64urlEncode(encrypted.ciphertext)}`,
  );
  expect(await a.inviter.poll()).toEqual({ status: "invalid" });
  expect(await a.pairs.current()).toBeNull();
});
