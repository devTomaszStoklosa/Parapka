import {
  base64urlEncode,
  decodeInvitation,
  encryptAcceptorKeys,
  generateDeviceKeys,
} from "@parapka/crypto";
import type { FetchInvitationKeysResponse } from "@parapka/protocol";
import { beforeAll, expect, it, vi } from "vitest";
import { createMemoryDatabase } from "../data/memory-database";
import { createIdentity } from "../identity/identity";
import { RelayError } from "../net/relay-error";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { createWebSodium } from "../platform/web-sodium";
import { createInviter } from "./inviter";
import { createPairRepository } from "./pair-repository";

let sodium: Awaited<ReturnType<typeof createWebSodium>>;

beforeAll(async () => {
  sodium = await createWebSodium();
});

const EXPIRES = Date.UTC(2030, 0, 2);

async function setup(options: { registered?: boolean } = {}) {
  const keyStore = createMemoryKeyStore();
  const database = createMemoryDatabase();
  let nowMs = EXPIRES - 1000;
  const identity = createIdentity({
    sodium,
    keyStore,
    database,
    relay: () => ({
      registerDevice: () =>
        options.registered === false
          ? Promise.reject(new RelayError("network"))
          : Promise.resolve({ deviceId: "device-a" }),
    }),
  });
  await identity.init();
  const relay = {
    createInvitation: vi.fn(() =>
      Promise.resolve({
        invitationId: "inv1",
        expiresAt: new Date(EXPIRES).toISOString(),
      }),
    ),
    fetchInvitationKeys: vi.fn((): Promise<FetchInvitationKeysResponse> =>
      Promise.reject(new RelayError("notFound", 404)),
    ),
  };
  const pairs = createPairRepository(database, keyStore);
  const inviter = createInviter({
    sodium,
    keyStore,
    clock: { nowMs: () => nowMs },
    identity,
    pairs,
    relay: () => relay,
    appUrl: "https://app.example",
  });
  return {
    inviter,
    pairs,
    relay,
    keyStore,
    setNow: (value: number) => (nowMs = value),
  };
}

async function created(inviter: Awaited<ReturnType<typeof setup>>["inviter"]) {
  const started = await inviter.start();
  if (started.status !== "created") throw new Error(started.status);
  return started.invitation;
}

it("creates an invitation with a link that carries the keys and the secret", async () => {
  const { inviter, relay } = await setup();
  const invitation = await created(inviter);
  expect(relay.createInvitation).toHaveBeenCalledTimes(1);
  expect(invitation.expiresAtMs).toBe(EXPIRES);
  const url = new URL(invitation.link);
  expect(url.origin + url.pathname).toBe("https://app.example/pair");
  const payload = decodeInvitation(url.hash.slice(1));
  expect(payload.invitationId).toBe("inv1");
  expect(payload.secret).toEqual(invitation.secret);
});

it("refuses an invitation when the device is already in a pair (FR-PAIR-09)", async () => {
  const { inviter, pairs, relay } = await setup();
  await pairs.savePending(
    {
      pairMailboxId: "m",
      partnerDeviceId: "d",
      partnerSigningPublicKey: "s",
      partnerAgreementPublicKey: "a",
    },
    { sendKey: Uint8Array.of(1), receiveKey: Uint8Array.of(2) },
  );
  expect(await inviter.start()).toEqual({ status: "alreadyPaired" });
  expect(relay.createInvitation).not.toHaveBeenCalled();
});

it("is offline when the device is not registered or the relay is unreachable", async () => {
  const unregistered = await setup({ registered: false });
  expect(await unregistered.inviter.start()).toEqual({ status: "offline" });
  expect(unregistered.relay.createInvitation).not.toHaveBeenCalled();

  const { inviter, relay } = await setup();
  relay.createInvitation.mockRejectedValueOnce(new RelayError("network"));
  expect(await inviter.start()).toEqual({ status: "offline" });
  relay.createInvitation.mockRejectedValueOnce(new RelayError("server", 500));
  await expect(inviter.start()).rejects.toThrow("server");
});

it("waits while the partner has not accepted", async () => {
  const { inviter, relay } = await setup();
  const invitation = await created(inviter);
  expect(await inviter.poll(invitation)).toEqual({ status: "waiting" });
  relay.fetchInvitationKeys.mockRejectedValueOnce(new RelayError("network"));
  expect(await inviter.poll(invitation)).toEqual({ status: "waiting" });
  relay.fetchInvitationKeys.mockRejectedValueOnce(
    new RelayError("server", 500),
  );
  await expect(inviter.poll(invitation)).rejects.toThrow("server");
  relay.fetchInvitationKeys.mockRejectedValueOnce(new Error("boom"));
  await expect(inviter.poll(invitation)).rejects.toThrow("boom");
});

it("reports an expired invitation on 410", async () => {
  const { inviter, relay } = await setup();
  const invitation = await created(inviter);
  relay.fetchInvitationKeys.mockRejectedValueOnce(
    new RelayError("expired", 410),
  );
  expect(await inviter.poll(invitation)).toEqual({ status: "expired" });
});

it("reports an expired invitation after 24 hours without asking the relay", async () => {
  const { inviter, relay, setNow } = await setup();
  const invitation = await created(inviter);
  setNow(EXPIRES);
  expect(await inviter.poll(invitation)).toEqual({ status: "expired" });
  expect(relay.fetchInvitationKeys).not.toHaveBeenCalled();
});

it("rejects keys that do not decrypt", async () => {
  const { inviter, relay, pairs } = await setup();
  const invitation = await created(inviter);
  const keys = generateDeviceKeys(sodium);
  const wrong = encryptAcceptorKeys(sodium, sodium.randomBytes(32), "inv1", {
    signing: keys.signing.publicKey,
    agreement: keys.agreement.publicKey,
  });
  const encryptedKeys = `${base64urlEncode(wrong.nonce)}.${base64urlEncode(wrong.ciphertext)}`;
  for (const text of [encryptedKeys, "no-dot", "a.b.c"]) {
    relay.fetchInvitationKeys.mockResolvedValueOnce({
      encryptedKeys: text,
      acceptedByDeviceId: "device-b",
      pairMailboxId: "mailbox",
    });
    expect(await inviter.poll(invitation)).toEqual({ status: "invalid" });
  }
  expect(await pairs.get()).toBeNull();
});

it("removes the pair when the codes differ", async () => {
  const { inviter, relay, pairs, keyStore } = await setup();
  const invitation = await created(inviter);
  const keys = generateDeviceKeys(sodium);
  const sealed = encryptAcceptorKeys(sodium, invitation.secret, "inv1", {
    signing: keys.signing.publicKey,
    agreement: keys.agreement.publicKey,
  });
  relay.fetchInvitationKeys.mockResolvedValueOnce({
    encryptedKeys: `${base64urlEncode(sealed.nonce)}.${base64urlEncode(sealed.ciphertext)}`,
    acceptedByDeviceId: "device-b",
    pairMailboxId: "mailbox",
  });
  const accepted = await inviter.poll(invitation);
  if (accepted.status !== "accepted") throw new Error(accepted.status);
  expect(await inviter.pendingSafetyCode()).toBe(accepted.safetyCode);
  expect((await pairs.get())?.pairMailboxId).toBe("mailbox");

  await pairs.reject();
  expect(await pairs.get()).toBeNull();
  expect(await keyStore.get("pair/send-key")).toBeNull();
  expect(await inviter.pendingSafetyCode()).toBeNull();
});
