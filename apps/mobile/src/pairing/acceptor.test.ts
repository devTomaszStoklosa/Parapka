import {
  base64urlDecode,
  decryptAcceptorKeys,
  encodeInvitation,
  generateDeviceKeys,
  generateInvitationSecret,
  type Sodium,
} from "@parapka/crypto";
import { beforeAll, describe, expect, it } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { createIdentity } from "../identity/identity";
import type { RelayClient } from "../net/relay-client";
import { RelayError, type RelayErrorKind } from "../net/relay-error";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { createWebSodium } from "../platform/web-sodium";
import { createAcceptor } from "./acceptor";
import { invitationLink } from "./invitation-link";
import { createPairRepository } from "./pair-repository";

let sodium: Sodium;

beforeAll(async () => {
  sodium = await createWebSodium();
});

const inviterKeys = () => {
  const keys = generateDeviceKeys(sodium);
  return {
    signing: keys.signing.publicKey,
    agreement: keys.agreement.publicKey,
  };
};

async function setup() {
  const keyStore = createMemoryKeyStore();
  const database = createMemoryDatabase();
  const identity = createIdentity({
    sodium,
    keyStore,
    database,
    relay: () => ({ registerDevice: () => Promise.resolve({ deviceId: "b" }) }),
  });
  await identity.init();
  const pairs = createPairRepository(database, keyStore);
  const secret = generateInvitationSecret(sodium);
  const text = encodeInvitation({
    invitationId: "aW52",
    publicKeys: inviterKeys(),
    secret,
  });
  const state = {
    calls: 0,
    failure: null as RelayErrorKind | null,
    sent: "",
  };
  const relay: Pick<RelayClient, "acceptInvitation"> = {
    acceptInvitation: (_id, encryptedKeys) => {
      state.calls += 1;
      state.sent = encryptedKeys;
      if (state.failure) return Promise.reject(new RelayError(state.failure));
      return Promise.resolve({ pairId: "pair", pairMailboxId: "mailbox" });
    },
  };
  const acceptor = createAcceptor({ sodium, relay, identity, pairs });
  return { acceptor, identity, pairs, keyStore, state, secret, text };
}

describe("Acceptor", () => {
  it("accepts a full link and saves a pending pair", async () => {
    const c = await setup();
    const result = await c.acceptor.accept(
      invitationLink("https://app.example", c.text),
    );
    expect(result.status).toBe("accepted");
    expect(await c.pairs.current()).toMatchObject({
      state: "pending-confirmation",
      pairMailboxId: "mailbox",
      deviceId: null,
    });
    expect(await c.pairs.keys()).not.toBeNull();
  });

  it("sends keys as nonce.ciphertext that the secret decrypts", async () => {
    const c = await setup();
    await c.acceptor.accept(c.text);
    const parts = c.state.sent.split(".");
    expect(parts).toHaveLength(2);
    const own = await c.identity.publicKeys();
    const keys = decryptAcceptorKeys(sodium, c.secret, "aW52", {
      nonce: base64urlDecode(parts[0] as string),
      ciphertext: base64urlDecode(parts[1] as string),
    });
    expect(keys).toEqual(own);
  });

  it("confirms and rejects the pair", async () => {
    const c = await setup();
    await c.acceptor.accept(c.text);
    await c.acceptor.confirm();
    expect((await c.pairs.activePair())?.state).toBe("confirmed");
    await c.acceptor.reject();
    expect(await c.pairs.current()).toBeNull();
    expect(await c.keyStore.get("pair/send")).toBeNull();
  });

  it.each(["garbage", "", "v2.a.b.c.d"])(
    "returns invalid for %j without a request",
    async (input) => {
      const c = await setup();
      expect(await c.acceptor.accept(input)).toEqual({ status: "invalid" });
      expect(c.state.calls).toBe(0);
    },
  );

  it("returns already-paired without a request", async () => {
    const c = await setup();
    await c.acceptor.accept(c.text);
    c.state.calls = 0;
    expect(await c.acceptor.accept(c.text)).toEqual({
      status: "already-paired",
    });
    expect(c.state.calls).toBe(0);
  });

  it.each([
    ["expired", "expired"],
    ["conflict", "inviter-paired"],
    ["network", "offline"],
    ["notFound", "invalid"],
    ["invalid", "invalid"],
  ] as const)("maps relay %s to %s and saves no pair", async (kind, status) => {
    const c = await setup();
    c.state.failure = kind;
    expect(await c.acceptor.accept(c.text)).toEqual({ status });
    expect(await c.pairs.current()).toBeNull();
  });

  it("rethrows unexpected relay errors", async () => {
    const c = await setup();
    c.state.failure = "server";
    await expect(c.acceptor.accept(c.text)).rejects.toBeInstanceOf(RelayError);
  });
});
