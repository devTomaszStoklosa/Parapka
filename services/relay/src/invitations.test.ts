import { generateKeyPairSync, sign } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { buildSignedText } from "./auth.js";
import { INVITATION_TTL_MS } from "./invitations.js";
import { MemoryStore } from "./store/memory-store.js";

const START = 1_700_000_000_000;
let now = START;
let store: MemoryStore;
let app: FastifyInstance;

beforeEach(() => {
  now = START;
  store = new MemoryStore();
  app = buildApp({ store, clock: { nowMs: () => now } });
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
    .toString("base64");
  const response = await app.inject({
    method: "POST",
    url: "/v1/devices",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ signingPublicKey: publicB64 }),
  });
  return {
    deviceId: response.json<{ deviceId: string }>().deviceId,
    sign: (text) =>
      sign(null, Buffer.from(text), privateKey).toString("base64"),
  };
}

/** Sends a request signed by `device`; `signed` false omits the signature. */
async function call(
  device: TestDevice,
  method: "GET" | "POST",
  url: string,
  options: { body?: unknown; signed?: boolean } = {},
) {
  const { body, signed = true } = options;
  const sent = (
    await app.inject({
      method: "POST",
      url: `/v1/devices/${device.deviceId}/challenges`,
    })
  ).json<{ challengeId: string; nonce: string }>();
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const text = buildSignedText({
    method,
    url,
    challengeId: sent.challengeId,
    nonce: sent.nonce,
    body: Buffer.from(payload ?? ""),
  });
  return app.inject({
    method,
    url,
    headers: {
      ...(payload === undefined ? {} : { "content-type": "application/json" }),
      "x-device-id": device.deviceId,
      "x-challenge-id": sent.challengeId,
      ...(signed ? { "x-signature": device.sign(text) } : {}),
    },
    payload,
  });
}

async function invite(device: TestDevice): Promise<string> {
  const response = await call(device, "POST", "/v1/invitations");
  expect(response.statusCode).toBe(201);
  return response.json<{ invitationId: string }>().invitationId;
}

const accept = (device: TestDevice, id: string, encryptedKeys = "SEALED") =>
  call(device, "POST", `/v1/invitations/${id}/accept`, {
    body: { encryptedKeys },
  });

describe("POST /v1/invitations", () => {
  it("creates an invitation valid for 24 hours", async () => {
    const a = await register();
    const response = await call(a, "POST", "/v1/invitations");
    expect(response.statusCode).toBe(201);
    const { invitationId, expiresAt } = response.json<{
      invitationId: string;
      expiresAt: string;
    }>();
    expect(invitationId).toMatch(/^[A-Za-z0-9_-]{22,}$/);
    expect(Date.parse(expiresAt)).toBe(START + INVITATION_TTL_MS);
    expect((await store.getInvitation(invitationId))?.deviceId).toBe(
      a.deviceId,
    );
  });

  it("answers 401 without a signature", async () => {
    const a = await register();
    const response = await call(a, "POST", "/v1/invitations", {
      signed: false,
    });
    expect(response.statusCode).toBe(401);
  });

  it("answers 409 to a device that is already paired", async () => {
    const a = await register();
    const b = await register();
    await accept(b, await invite(a));
    expect((await call(a, "POST", "/v1/invitations")).statusCode).toBe(409);
    expect((await call(b, "POST", "/v1/invitations")).statusCode).toBe(409);
  });
});

describe("POST /v1/invitations/{id}/accept", () => {
  it("stores the ciphertext and pairs both devices in a random mailbox", async () => {
    const a = await register();
    const b = await register();
    const id = await invite(a);
    const response = await accept(b, id, "OPAQUE");
    expect(response.statusCode).toBe(200);
    const { pairMailboxId } = response.json<{ pairMailboxId: string }>();
    expect(pairMailboxId).toMatch(/^[A-Za-z0-9_-]{22,}$/);
    expect(await store.getMailbox(pairMailboxId)).toEqual({
      pairMailboxId,
      deviceIdA: a.deviceId,
      deviceIdB: b.deviceId,
      createdAtMs: now,
    });
    expect((await store.getInvitation(id))?.encryptedKeysB).toBe("OPAQUE");
  });

  it("answers 400 without ciphertext and 404 for an unknown invitation", async () => {
    const a = await register();
    const b = await register();
    const id = await invite(a);
    const bad = await call(b, "POST", `/v1/invitations/${id}/accept`, {
      body: {},
    });
    expect(bad.statusCode).toBe(400);
    expect((await accept(b, "nope")).statusCode).toBe(404);
  });

  it("answers 410 to a used invitation and does not pair the third device", async () => {
    const a = await register();
    const b = await register();
    const c = await register();
    const id = await invite(a);
    await accept(b, id);
    expect((await accept(c, id)).statusCode).toBe(410);
    expect(await store.findMailboxByDevice(c.deviceId)).toBeNull();
  });

  it("is valid just before 24 hours and answers 410 from 24 hours on", async () => {
    const a = await register();
    const b = await register();
    const c = await register();
    const early = await invite(a);
    now = START + INVITATION_TTL_MS - 1;
    expect((await accept(b, early)).statusCode).toBe(200);

    const d = await register();
    const e = await register();
    const late = await invite(d);
    now += INVITATION_TTL_MS;
    expect((await accept(e, late)).statusCode).toBe(410);
    expect(await store.findMailboxByDevice(d.deviceId)).toBeNull();
    expect(await store.findMailboxByDevice(e.deviceId)).toBeNull();
    expect(c.deviceId).not.toBe(e.deviceId);
  });

  it("refuses the own invitation with 403", async () => {
    const a = await register();
    const id = await invite(a);
    expect((await accept(a, id)).statusCode).toBe(403);
    expect(await store.findMailboxByDevice(a.deviceId)).toBeNull();
    expect((await store.getInvitation(id))?.acceptedByDeviceId).toBeNull();
  });

  it("answers 409 when the accepting device is already paired", async () => {
    const a = await register();
    const b = await register();
    const c = await register();
    await accept(b, await invite(a));
    const id = await invite(c);
    expect((await accept(b, id)).statusCode).toBe(409);
    expect((await store.getInvitation(id))?.acceptedByDeviceId).toBeNull();
  });

  it("answers 409 when the inviting device got paired meanwhile", async () => {
    const a = await register();
    const b = await register();
    const c = await register();
    const first = await invite(a);
    const second = await invite(a);
    await accept(b, first);
    expect((await accept(c, second)).statusCode).toBe(409);
    expect(await store.findMailboxByDevice(c.deviceId)).toBeNull();
  });
});

describe("GET /v1/invitations/{id}/keys", () => {
  it("returns the ciphertext to the creator only", async () => {
    const a = await register();
    const b = await register();
    const c = await register();
    const id = await invite(a);
    const url = `/v1/invitations/${id}/keys`;
    expect((await call(a, "GET", url)).statusCode).toBe(404);
    await accept(b, id, "OPAQUE");
    const own = await call(a, "GET", url);
    expect(own.statusCode).toBe(200);
    expect(own.json()).toEqual({
      encryptedKeys: "OPAQUE",
      acceptedByDeviceId: b.deviceId,
    });
    expect((await call(b, "GET", url)).statusCode).toBe(403);
    expect((await call(c, "GET", url)).statusCode).toBe(403);
    expect((await call(a, "GET", url, { signed: false })).statusCode).toBe(401);
    expect((await call(a, "GET", "/v1/invitations/nope/keys")).statusCode).toBe(
      404,
    );
  });
});
