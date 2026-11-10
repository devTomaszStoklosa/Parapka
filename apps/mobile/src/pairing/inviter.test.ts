import {
  base64urlEncode,
  decodeInvitation,
  encryptAcceptorKeys,
  generateDeviceKeys,
  type Sodium,
} from "@parapka/crypto";
import { beforeAll, describe, expect, it } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { createIdentity } from "../identity/identity";
import type { RelayClient } from "../net/relay-client";
import { RelayError, type RelayErrorKind } from "../net/relay-error";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { createWebSodium } from "../platform/web-sodium";
import { createInviter } from "./inviter";
import { parseInvitationLink } from "./invitation-link";
import { createPairRepository } from "./pair-repository";

const HOUR = 3_600_000;
const NOW = 1_000_000_000_000;

let sodium: Sodium;

beforeAll(async () => {
  sodium = await createWebSodium();
});

async function setup() {
  const keyStore = createMemoryKeyStore();
  const database = createMemoryDatabase();
  const identity = createIdentity({
    sodium,
    keyStore,
    database,
    relay: () => ({ registerDevice: () => Promise.resolve({ deviceId: "a" }) }),
  });
  await identity.init();
  const pairs = createPairRepository(database, keyStore);
  const state = {
    now: NOW,
    calls: 0,
    failure: null as RelayErrorKind | null,
    encryptedKeys: "",
  };
  const relay: Pick<RelayClient, "createInvitation" | "fetchInvitationKeys"> = {
    createInvitation: () => {
      state.calls += 1;
      if (state.failure) {
        return Promise.reject(new RelayError(state.failure));
      }
      return Promise.resolve({
        invitationId: "aW52",
        expiresAt: new Date(NOW + 24 * HOUR).toISOString(),
      });
    },
    fetchInvitationKeys: () => {
      state.calls += 1;
      if (state.failure) {
        return Promise.reject(new RelayError(state.failure));
      }
      return Promise.resolve({
        encryptedKeys: state.encryptedKeys,
        acceptedByDeviceId: "b",
        pairMailboxId: "mailbox",
      });
    },
  };
  const inviter = createInviter({
    sodium,
    relay,
    identity,
    pairs,
    clock: { nowMs: () => state.now },
    appUrl: "https://app.example",
  });
  return { inviter, identity, pairs, keyStore, state };
}

/** Plays B: encrypts its keys for the invitation in `link`. */
function acceptAsB(link: string): string {
  const text = parseInvitationLink(link) as string;
  const invitation = decodeInvitation(text);
  const b = generateDeviceKeys(sodium);
  const encrypted = encryptAcceptorKeys(
    sodium,
    invitation.secret,
    invitation.invitationId,
    { signing: b.signing.publicKey, agreement: b.agreement.publicKey },
  );
  return `${base64urlEncode(encrypted.nonce)}.${base64urlEncode(encrypted.ciphertext)}`;
}

async function created(context: Awaited<ReturnType<typeof setup>>) {
  const result = await context.inviter.create();
  if (result.status !== "created") throw new Error("not created");
  return result;
}

describe("Inviter", () => {
  it("creates an invitation with a link and 24 h of validity", async () => {
    const context = await setup();
    const result = await created(context);
    expect(result.invitationId).toBe("aW52");
    expect(result.expiresAt).toBe(NOW + 24 * HOUR);
    const text = parseInvitationLink(result.link) as string;
    expect(decodeInvitation(text).invitationId).toBe("aW52");
  });

  it("waits while B has not accepted", async () => {
    const context = await setup();
    await created(context);
    context.state.failure = "notFound";
    expect(await context.inviter.poll()).toEqual({ status: "waiting" });
  });

  it("saves the pair as pending after B accepted and rejects it", async () => {
    const context = await setup();
    const { link } = await created(context);
    context.state.encryptedKeys = acceptAsB(link);
    const result = await context.inviter.poll();
    expect(result.status).toBe("accepted");
    expect(await context.pairs.current()).toMatchObject({
      state: "pending-confirmation",
      pairMailboxId: "mailbox",
      deviceId: "b",
    });
    expect(await context.pairs.activePair()).toBeNull();
    await context.inviter.reject();
    expect(await context.pairs.current()).toBeNull();
    expect(await context.keyStore.get("pair/send")).toBeNull();
    expect(await context.keyStore.get("pair/receive")).toBeNull();
  });

  it("confirms the pair", async () => {
    const context = await setup();
    const { link } = await created(context);
    context.state.encryptedKeys = acceptAsB(link);
    await context.inviter.poll();
    await context.inviter.confirm();
    expect((await context.pairs.activePair())?.state).toBe("confirmed");
  });

  it.each(["pending-confirmation", "confirmed"] as const)(
    "does not ask the relay when a %s pair exists",
    async (state) => {
      const context = await setup();
      await context.pairs.savePending(
        {
          pairMailboxId: "m",
          deviceId: "b",
          signingPublicKey: "s",
          agreementPublicKey: "a",
        },
        { sendKey: new Uint8Array(32), receiveKey: new Uint8Array(32) },
      );
      if (state === "confirmed") await context.pairs.confirm();
      expect(await context.inviter.create()).toEqual({
        status: "already-paired",
      });
      expect(context.state.calls).toBe(0);
    },
  );

  it("expires on 410", async () => {
    const context = await setup();
    await created(context);
    context.state.failure = "expired";
    expect(await context.inviter.poll()).toEqual({ status: "expired" });
  });

  it("expires after 24 h without asking the relay", async () => {
    const context = await setup();
    await created(context);
    const calls = context.state.calls;
    context.state.now = NOW + 24 * HOUR + 1;
    expect(await context.inviter.poll()).toEqual({ status: "expired" });
    expect(context.state.calls).toBe(calls);
  });

  it("expires when there is no invitation", async () => {
    const { inviter } = await setup();
    expect(await inviter.poll()).toEqual({ status: "expired" });
  });

  it("reports offline on create and on poll", async () => {
    const context = await setup();
    context.state.failure = "network";
    expect(await context.inviter.create()).toEqual({ status: "offline" });
    context.state.failure = null;
    await created(context);
    context.state.failure = "network";
    expect(await context.inviter.poll()).toEqual({ status: "offline" });
  });

  it("fails when the device keys are gone", async () => {
    const context = await setup();
    const { link } = await created(context);
    context.state.encryptedKeys = acceptAsB(link);
    await context.identity.clear();
    await expect(context.inviter.poll()).rejects.toThrow("no keys");
    await expect(context.inviter.create()).rejects.toThrow("no keys");
  });

  it("rethrows other relay errors", async () => {
    const context = await setup();
    await created(context);
    context.state.failure = "server";
    await expect(context.inviter.poll()).rejects.toThrow("relay error");
    await expect(context.inviter.create()).rejects.toThrow("relay error");
  });

  it.each([
    ["a missing dot", "abc"],
    ["bad base64url", "!!!.???"],
    [
      "a wrong secret",
      "AAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    ],
  ])("returns invalid for %s", async (_name, encryptedKeys) => {
    const context = await setup();
    await created(context);
    context.state.encryptedKeys = encryptedKeys;
    expect(await context.inviter.poll()).toEqual({ status: "invalid" });
    expect(await context.pairs.current()).toBeNull();
  });
});
