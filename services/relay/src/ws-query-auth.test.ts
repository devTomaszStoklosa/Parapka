import { generateKeyPairSync, sign } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { buildSignedText } from "./auth.js";
import { MemoryStore } from "./store/memory-store.js";

let app: FastifyInstance;

beforeEach(async () => {
  app = buildApp({
    store: new MemoryStore(),
    clock: { nowMs: () => 1_700_000_000_000 },
  });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

interface TestDevice {
  deviceId: string;
  sign(text: string): string;
}

async function register(): Promise<TestDevice> {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicB64 = publicKey
    .export({ format: "der", type: "spki" })
    .subarray(-32)
    .toString("base64url");
  const response = await app.inject({
    method: "POST",
    url: "/v1/devices",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ signingPublicKey: publicB64 }),
  });
  return {
    deviceId: response.json<{ deviceId: string }>().deviceId,
    sign: (text) =>
      sign(null, Buffer.from(text), privateKey).toString("base64url"),
  };
}

/** Pairs two devices; returns the first one and the mailbox. */
async function pair() {
  const a = await register();
  const b = await register();
  const headers = async (device: TestDevice, url: string, body = "") => {
    const sent = (
      await app.inject({
        method: "POST",
        url: `/v1/devices/${device.deviceId}/challenges`,
      })
    ).json<{ challengeId: string; nonce: string }>();
    const text = buildSignedText({
      method: "POST",
      url,
      challengeId: sent.challengeId,
      nonce: sent.nonce,
      body: Buffer.from(body),
    });
    return {
      "x-device-id": device.deviceId,
      "x-challenge-id": sent.challengeId,
      "x-signature": device.sign(text),
    };
  };
  const created = await app.inject({
    method: "POST",
    url: "/v1/invitations",
    headers: await headers(a, "/v1/invitations"),
  });
  const { invitationId } = created.json<{ invitationId: string }>();
  const acceptUrl = `/v1/invitations/${invitationId}/accept`;
  const payload = JSON.stringify({ encryptedKeys: "SEALED" });
  const accepted = await app.inject({
    method: "POST",
    url: acceptUrl,
    headers: {
      ...(await headers(b, acceptUrl, payload)),
      "content-type": "application/json",
    },
    payload,
  });
  return {
    a,
    mailbox: accepted.json<{ pairMailboxId: string }>().pairMailboxId,
  };
}

/** The query of a WebSocket URL signed by the device; `extra` stays signed. */
async function signedQuery(
  device: TestDevice,
  path: string,
  extra: string,
  tamper?: (signature: string) => string,
): Promise<string> {
  const sent = (
    await app.inject({
      method: "POST",
      url: `/v1/devices/${device.deviceId}/challenges`,
    })
  ).json<{ challengeId: string; nonce: string }>();
  const text = buildSignedText({
    method: "GET",
    url: extra === "" ? path : `${path}?${extra}`,
    challengeId: sent.challengeId,
    nonce: sent.nonce,
    body: Buffer.from(""),
  });
  const signature = device.sign(text);
  const auth = new URLSearchParams({
    deviceId: device.deviceId,
    challengeId: sent.challengeId,
    signature: tamper === undefined ? signature : tamper(signature),
  }).toString();
  return extra === "" ? auth : `${extra}&${auth}`;
}

describe("WebSocket authentication by query parameters", () => {
  it("accepts a valid signature", async () => {
    const { a, mailbox } = await pair();
    const path = `/v1/pairs/${mailbox}/ws`;
    const ws = await app.injectWS(`${path}?${await signedQuery(a, path, "")}`);
    ws.terminate();
  });

  it("signs the query without the three parameters", async () => {
    const { a, mailbox } = await pair();
    const path = `/v1/pairs/${mailbox}/ws`;
    const query = await signedQuery(a, path, "client=web");
    const ws = await app.injectWS(`${path}?${query}`);
    ws.terminate();
  });

  it("rejects a wrong signature with 401", async () => {
    const { a, mailbox } = await pair();
    const path = `/v1/pairs/${mailbox}/ws`;
    const query = await signedQuery(a, path, "", (s) => `${s.startsWith("A") ? "B" : "A"}${s.slice(1)}`);
    await expect(app.injectWS(`${path}?${query}`)).rejects.toThrow(/401/);
  });

  it("rejects a signature of another URL with 401", async () => {
    const { a, mailbox } = await pair();
    const path = `/v1/pairs/${mailbox}/ws`;
    const query = await signedQuery(a, path, "client=web");
    await expect(
      app.injectWS(`${path}?${query.replace("client=web", "client=x")}`),
    ).rejects.toThrow(/401/);
  });

  it("rejects missing parameters with 401", async () => {
    const { mailbox } = await pair();
    await expect(app.injectWS(`/v1/pairs/${mailbox}/ws`)).rejects.toThrow(
      /401/,
    );
  });

  it("does not take the query on other routes", async () => {
    const { a, mailbox } = await pair();
    const path = `/v1/pairs/${mailbox}/envelopes`;
    const response = await app.inject({
      method: "GET",
      url: `${path}?${await signedQuery(a, path, "")}`,
    });
    expect(response.statusCode).toBe(401);
  });
});
