import { base64urlDecode } from "@parapka/crypto";
import { buildSignedText } from "@parapka/protocol";
import { beforeAll, expect, it } from "vitest";
import { webSha256 } from "../platform/sha256";
import { createWebSodium } from "../platform/web-sodium";
import type { Sodium } from "@parapka/crypto";
import { createRelayClient, type RelayFetch } from "./relay-client";
import { RelayError, type RelayErrorKind } from "./relay-error";

let sodium: Sodium;

beforeAll(async () => {
  sodium = await createWebSodium();
});

interface Recorded {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | undefined;
}

/** A fetch that answers the challenge and then `answer`, and records the requests. */
function fakeFetch(answer: { status: number; body?: unknown }) {
  const requests: Recorded[] = [];
  const fetch: RelayFetch = (url, init) => {
    requests.push({ url, ...init, body: init.body });
    const isChallenge = url.endsWith("/challenges");
    const status = isChallenge ? 201 : answer.status;
    const body = isChallenge
      ? { challengeId: "chal", nonce: "nonce", expiresAt: 1 }
      : answer.body;
    return Promise.resolve({
      status,
      text: () =>
        Promise.resolve(body === undefined ? "" : JSON.stringify(body)),
    });
  };
  return { fetch, requests };
}

function setup(answer: { status: number; body?: unknown }) {
  const keys = sodium.signKeyPair();
  const { fetch, requests } = fakeFetch(answer);
  const client = createRelayClient({
    baseUrl: "https://relay.example/",
    fetch,
    sodium,
    sha256: webSha256,
    credentials: { deviceId: "dev1", signingPrivateKey: keys.privateKey },
  });
  return { client, requests, keys };
}

it("signs the request text with the device key", async () => {
  const { client, requests, keys } = setup({
    status: 201,
    body: { invitationId: "inv", expiresAt: "x" },
  });
  await client.createInvitation();
  expect(requests[0]?.url).toBe(
    "https://relay.example/v1/devices/dev1/challenges",
  );
  const request = requests[1];
  expect(request?.url).toBe("https://relay.example/v1/invitations");
  expect(request?.headers["X-Device-Id"]).toBe("dev1");
  expect(request?.headers["X-Challenge-Id"]).toBe("chal");
  const body = '{"deviceId":"dev1"}';
  expect(request?.body).toBe(body);
  const hash = await webSha256(new TextEncoder().encode(body));
  const text = buildSignedText({
    method: "POST",
    url: "/v1/invitations",
    challengeId: "chal",
    nonce: "nonce",
    bodyHashHex: Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join(
      "",
    ),
  });
  const signature = base64urlDecode(request?.headers["X-Signature"] ?? "");
  expect(
    sodium.verify(signature, new TextEncoder().encode(text), keys.publicKey),
  ).toBe(true);
});

it("registers a device without a signature", async () => {
  const { client, requests } = setup({ status: 201, body: { deviceId: "d" } });
  expect(await client.registerDevice("key")).toEqual({ deviceId: "d" });
  expect(requests).toHaveLength(1);
  expect(requests[0]?.headers["X-Signature"]).toBeUndefined();
  expect(requests[0]?.body).toBe('{"signingPublicKey":"key"}');
});

it("uses the paths and methods of the endpoints", async () => {
  const { client, requests } = setup({ status: 200, body: {} });
  const envelope = {
    envelopeId: "e",
    pairMailboxId: "m",
    senderDeviceId: "dev1",
    protocolVersion: 1,
    nonce: "n",
    ciphertext: "c",
  };
  await client.setPushToken({ platform: "fcm", pushToken: "t" });
  await client.acceptInvitation("i 1", "SEALED");
  await client.fetchInvitationKeys("i1");
  await client.sendEnvelope("m", envelope);
  await client.fetchEnvelopes("m", "c 1");
  await client.fetchEnvelopes("m", null);
  await client.ack("m", ["e"]);
  const calls = requests
    .filter((r) => !r.url.endsWith("/challenges"))
    .map((r) => `${r.method} ${r.url.replace("https://relay.example", "")}`);
  expect(calls).toEqual([
    "PUT /v1/devices/dev1/push-token",
    "POST /v1/invitations/i%201/accept",
    "GET /v1/invitations/i1/keys",
    "POST /v1/pairs/m/envelopes",
    "GET /v1/pairs/m/envelopes?after=c%201",
    "GET /v1/pairs/m/envelopes",
    "POST /v1/pairs/m/acks",
  ]);
});

it("resolves without a body for deleteDevice and closePair", async () => {
  const { client, requests } = setup({ status: 204 });
  await client.deleteDevice();
  await client.closePair("m");
  const calls = requests.filter((r) => !r.url.endsWith("/challenges"));
  expect(calls.map((r) => r.method)).toEqual(["DELETE", "DELETE"]);
  expect(calls[0]?.headers["content-type"]).toBeUndefined();
});

it("builds the WebSocket URL with the credentials in the query", async () => {
  const { client } = setup({ status: 200 });
  const url = await client.webSocketUrl("m");
  expect(url).toMatch(
    /^wss:\/\/relay\.example\/v1\/pairs\/m\/ws\?deviceId=dev1&challengeId=chal&signature=[\w-]{86}$/,
  );
});

const statuses: [number, RelayErrorKind][] = [
  [400, "invalid"],
  [401, "unauthorized"],
  [403, "forbidden"],
  [404, "notFound"],
  [409, "conflict"],
  [410, "expired"],
  [413, "tooLarge"],
  [429, "rateLimited"],
  [500, "server"],
];

it.each(statuses)("maps status %i to %s", async (status, kind) => {
  const { client } = setup({ status, body: { error: "x" } });
  await expect(client.fetchInvitationKeys("i")).rejects.toMatchObject({
    kind,
    status,
  });
});

it("maps a failing fetch to network", async () => {
  const client = createRelayClient({
    baseUrl: "https://relay.example",
    fetch: () => Promise.reject(new Error("offline")),
    sodium,
    sha256: webSha256,
  });
  await expect(client.registerDevice("k")).rejects.toMatchObject({
    kind: "network",
  });
});

it("maps an unreadable success body to server", async () => {
  const client = createRelayClient({
    baseUrl: "https://relay.example",
    fetch: () =>
      Promise.resolve({ status: 201, text: () => Promise.resolve("<html>") }),
    sodium,
    sha256: webSha256,
  });
  await expect(client.registerDevice("k")).rejects.toBeInstanceOf(RelayError);
});

it("refuses signed calls without credentials", async () => {
  const client = createRelayClient({
    baseUrl: "https://relay.example",
    fetch: () => Promise.reject(new Error("must not be called")),
    sodium,
    sha256: webSha256,
  });
  await expect(client.deleteDevice()).rejects.toMatchObject({
    kind: "unauthorized",
  });
});

it("fails when the challenge is refused", async () => {
  const client = createRelayClient({
    baseUrl: "https://relay.example",
    fetch: () =>
      Promise.resolve({ status: 404, text: () => Promise.resolve("") }),
    sodium,
    sha256: webSha256,
    credentials: { deviceId: "d", signingPrivateKey: new Uint8Array(64) },
  });
  await expect(client.closePair("m")).rejects.toMatchObject({
    kind: "notFound",
  });
});
