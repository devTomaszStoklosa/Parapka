import { webSha256 } from "../../../apps/mobile/src/platform/sha256";
import { createWebSodium } from "../../../apps/mobile/src/platform/web-sodium";
import { createRelayClient } from "../../../apps/mobile/src/net/relay-client";
import type { RelayFetch } from "../../../apps/mobile/src/net/relay-client";
import { base64urlEncode, type Sodium } from "@parapka/crypto";
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

/** A fetch backed by `app.inject`; `tamper` may change the request headers. */
function injectFetch(
  tamper: (headers: Record<string, string>) => void = () => undefined,
): RelayFetch {
  return async (url, init) => {
    const headers = { ...init.headers };
    tamper(headers);
    const response = await app.inject({
      method: init.method as "GET",
      url: url.replace("http://relay", ""),
      headers,
      ...(init.body === undefined ? {} : { payload: init.body }),
    });
    return {
      status: response.statusCode,
      text: () => Promise.resolve(response.body),
    };
  };
}

async function newClient(fetch: RelayFetch) {
  const keys = sodium.signKeyPair();
  const anonymous = createRelayClient({
    baseUrl: "http://relay",
    fetch,
    sodium,
    sha256: webSha256,
  });
  const { deviceId } = await anonymous.registerDevice(
    base64urlEncode(keys.publicKey),
  );
  return createRelayClient({
    baseUrl: "http://relay",
    fetch,
    sodium,
    sha256: webSha256,
    credentials: { deviceId, signingPrivateKey: keys.privateKey },
  });
}

it("accepts a signed request from the client", async () => {
  const client = await newClient(injectFetch());
  const invitation = await client.createInvitation();
  expect(invitation.invitationId).not.toBe("");
  await client.setPushToken({ platform: "fcm", pushToken: "token" });
});

it("pairs two devices and exchanges an envelope", async () => {
  const fetch = injectFetch();
  const a = await newClient(fetch);
  const b = await newClient(fetch);
  const { invitationId } = await a.createInvitation();
  const accepted = await b.acceptInvitation(invitationId, "SEALED");
  const keys = await a.fetchInvitationKeys(invitationId);
  expect(keys.pairMailboxId).toBe(accepted.pairMailboxId);
  const envelope = {
    envelopeId: "env1",
    pairMailboxId: accepted.pairMailboxId,
    senderDeviceId: keys.acceptedByDeviceId,
    protocolVersion: 1,
    nonce: "AAAA",
    ciphertext: "AAAA",
  };
  expect(
    (await b.sendEnvelope(accepted.pairMailboxId, envelope)).accepted,
  ).toBe(true);
  const fetched = await a.fetchEnvelopes(accepted.pairMailboxId, null);
  expect(fetched.envelopes).toHaveLength(1);
  expect(await a.ack(accepted.pairMailboxId, [envelope.envelopeId])).toEqual({
    deleted: 1,
  });
  await b.closePair(accepted.pairMailboxId);
});

it("answers unauthorized for a changed signature", async () => {
  const client = await newClient(
    injectFetch((headers) => {
      if (headers["X-Signature"] !== undefined) {
        headers["X-Signature"] = base64urlEncode(new Uint8Array(64));
      }
    }),
  );
  await expect(client.createInvitation()).rejects.toMatchObject({
    kind: "unauthorized",
  });
});
