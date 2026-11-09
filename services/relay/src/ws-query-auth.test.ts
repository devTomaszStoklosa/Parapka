import { generateKeyPairSync, sign } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { buildSignedText } from "./auth.js";
import { MemoryStore } from "./store/memory-store.js";

let app: FastifyInstance;
let deviceId: string;
let mailbox: string;
let signText: (text: string) => string;

async function post(url: string, payload: unknown, headers = {}) {
  return app.inject({
    method: "POST",
    url,
    headers: { "content-type": "application/json", ...headers },
    payload: JSON.stringify(payload),
  });
}

beforeEach(async () => {
  app = buildApp({ store: new MemoryStore(), clock: { nowMs: () => 1e12 } });
  await app.ready();
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  signText = (text) =>
    sign(null, Buffer.from(text), privateKey).toString("base64url");
  const publicB64 = publicKey
    .export({ format: "der", type: "spki" })
    .subarray(-32)
    .toString("base64url");
  deviceId = (await post("/v1/devices", { signingPublicKey: publicB64 })).json<{
    deviceId: string;
  }>().deviceId;
  // A second device that creates the pair, so the first one is a member.
  const other = generateKeyPairSync("ed25519");
  const otherKey = other.publicKey
    .export({ format: "der", type: "spki" })
    .subarray(-32)
    .toString("base64url");
  const otherId = (
    await post("/v1/devices", { signingPublicKey: otherKey })
  ).json<{ deviceId: string }>().deviceId;
  const signedFor = async (
    id: string,
    sig: (t: string) => string,
    url: string,
    payload: unknown,
  ) => {
    const c = (
      await app.inject({ method: "POST", url: `/v1/devices/${id}/challenges` })
    ).json<{ challengeId: string; nonce: string }>();
    const body = JSON.stringify(payload);
    const text = buildSignedText({
      method: "POST",
      url,
      challengeId: c.challengeId,
      nonce: c.nonce,
      body: Buffer.from(body),
    });
    return {
      "x-device-id": id,
      "x-challenge-id": c.challengeId,
      "x-signature": sig(text),
    };
  };
  const otherSign = (text: string) =>
    sign(null, Buffer.from(text), other.privateKey).toString("base64url");
  const invite = await post(
    "/v1/invitations",
    {},
    await signedFor(otherId, otherSign, "/v1/invitations", {}),
  );
  const invitationId = invite.json<{ invitationId: string }>().invitationId;
  const acceptUrl = `/v1/invitations/${invitationId}/accept`;
  const accept = await post(
    acceptUrl,
    { encryptedKeys: "SEALED" },
    await signedFor(deviceId, signText, acceptUrl, {
      encryptedKeys: "SEALED",
    }),
  );
  mailbox = accept.json<{ pairMailboxId: string }>().pairMailboxId;
});

afterEach(async () => {
  await app.close();
});

interface Credentials {
  deviceId: string;
  challengeId: string;
  signature: string;
}

/** Signs `signedUrl`, the path with the query the relay must see after removing the credentials. */
async function credentials(signedUrl: string): Promise<Credentials> {
  const c = (
    await app.inject({
      method: "POST",
      url: `/v1/devices/${deviceId}/challenges`,
    })
  ).json<{ challengeId: string; nonce: string }>();
  const text = buildSignedText({
    method: "GET",
    url: signedUrl,
    challengeId: c.challengeId,
    nonce: c.nonce,
    body: new Uint8Array(),
  });
  return {
    deviceId,
    challengeId: c.challengeId,
    signature: signText(text),
  };
}

function query(c: Credentials, extra = ""): string {
  const own = `deviceId=${c.deviceId}&challengeId=${c.challengeId}&signature=${c.signature}`;
  return extra === "" ? own : `${extra}&${own}`;
}

describe("WebSocket authentication by query parameters", () => {
  it("accepts a signature in the query", async () => {
    const path = `/v1/pairs/${mailbox}/ws`;
    const c = await credentials(path);
    const socket = await app.injectWS(`${path}?${query(c)}`);
    socket.terminate();
  });

  it("signs the remaining query when there are other parameters", async () => {
    const path = `/v1/pairs/${mailbox}/ws`;
    const c = await credentials(`${path}?a=1&b=x%20y`);
    const socket = await app.injectWS(`${path}?${query(c, "a=1&b=x%20y")}`);
    socket.terminate();
  });

  it("rejects a wrong signature", async () => {
    const path = `/v1/pairs/${mailbox}/ws`;
    const c = await credentials(path);
    c.signature = Buffer.alloc(64).toString("base64url");
    await expect(app.injectWS(`${path}?${query(c)}`)).rejects.toThrow(/401/);
  });

  it("rejects a signature over a URL that still holds the credentials", async () => {
    const path = `/v1/pairs/${mailbox}/ws`;
    const c = await credentials(path);
    const bad = await credentials(`${path}?${query(c)}`);
    await expect(app.injectWS(`${path}?${query(bad)}`)).rejects.toThrow(/401/);
  });

  it("rejects a connection with an incomplete query", async () => {
    const path = `/v1/pairs/${mailbox}/ws`;
    const c = await credentials(path);
    await expect(
      app.injectWS(
        `${path}?deviceId=${c.deviceId}&challengeId=${c.challengeId}`,
      ),
    ).rejects.toThrow(/401/);
  });

  it("still accepts the headers", async () => {
    const path = `/v1/pairs/${mailbox}/ws`;
    const c = await credentials(path);
    const socket = await app.injectWS(path, {
      headers: {
        "x-device-id": c.deviceId,
        "x-challenge-id": c.challengeId,
        "x-signature": c.signature,
      },
    });
    socket.terminate();
  });

  it("ignores the query on a plain HTTP route", async () => {
    const path = `/v1/pairs/${mailbox}/envelopes`;
    const c = await credentials(path);
    const response = await app.inject({
      method: "GET",
      url: `${path}?${query(c)}`,
    });
    expect(response.statusCode).toBe(401);
  });
});
