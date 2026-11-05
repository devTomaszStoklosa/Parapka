import { generateKeyPairSync, sign } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import {
  AUTH_CONTEXT_PREFIX,
  buildSignedText,
  CHALLENGE_TTL_MS,
} from "./auth.js";
import { MemoryStore } from "./store/memory-store.js";

let now = 1_700_000_000_000;
let store: MemoryStore;
let app: FastifyInstance;

beforeEach(() => {
  now = 1_700_000_000_000;
  store = new MemoryStore();
  app = buildApp({ store, clock: { nowMs: () => now } });
});

interface TestDevice {
  deviceId: string;
  publicKey: string;
  sign(text: string): string;
}

const JSON_HEADERS = { "content-type": "application/json" };
const BODY = JSON.stringify({ platform: "fcm", pushToken: "tok" });

async function register(): Promise<TestDevice> {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicB64 = publicKey
    .export({ format: "der", type: "spki" })
    .subarray(-32)
    .toString("base64");
  const response = await app.inject({
    method: "POST",
    url: "/v1/devices",
    headers: JSON_HEADERS,
    payload: JSON.stringify({ signingPublicKey: publicB64 }),
  });
  return {
    deviceId: response.json<{ deviceId: string }>().deviceId,
    publicKey: publicB64,
    sign: (text) =>
      sign(null, Buffer.from(text), privateKey).toString("base64"),
  };
}

interface Challenge {
  challengeId: string;
  nonce: string;
}

async function challenge(deviceId: string): Promise<Challenge> {
  const response = await app.inject({
    method: "POST",
    url: `/v1/devices/${deviceId}/challenges`,
  });
  return response.json<Challenge>();
}

interface Variation {
  /** Device that signs; defaults to the claimed device. */
  signer?: TestDevice;
  /** Device whose challenge is requested; defaults to the claimed device. */
  challengeFor?: TestDevice;
  /** Challenge the text is signed over, instead of the sent one. */
  signedChallenge?: Challenge;
  signedMethod?: string;
  signedPath?: string;
  signedBody?: string;
  noPrefix?: boolean;
  noSignature?: boolean;
  body?: string;
}

function signedText(
  url: string,
  v: Variation,
  sent: Challenge,
  body: string,
): string {
  const over = v.signedChallenge ?? sent;
  const text = buildSignedText({
    method: v.signedMethod ?? "PUT",
    url: v.signedPath ?? url,
    challengeId: over.challengeId,
    nonce: over.nonce,
    body: Buffer.from(v.signedBody ?? body),
  });
  return v.noPrefix === true ? text.slice(AUTH_CONTEXT_PREFIX.length) : text;
}

/** PUTs a push token as `claimed`, signing as the options say. */
async function putToken(
  target: TestDevice,
  claimed: TestDevice,
  v: Variation = {},
): Promise<{ statusCode: number }> {
  const sent = await challenge((v.challengeFor ?? claimed).deviceId);
  const url = `/v1/devices/${target.deviceId}/push-token`;
  const body = v.body ?? BODY;
  const signature = (v.signer ?? claimed).sign(signedText(url, v, sent, body));
  return app.inject({
    method: "PUT",
    url,
    headers: {
      ...JSON_HEADERS,
      "x-device-id": claimed.deviceId,
      "x-challenge-id": sent.challengeId,
      ...(v.noSignature === true ? {} : { "x-signature": signature }),
    },
    payload: body,
  });
}

describe("POST /v1/devices", () => {
  it("returns a random 128-bit deviceId and stores only key and time", async () => {
    const a = await register();
    const b = await register();
    expect(a.deviceId).toMatch(/^[A-Za-z0-9_-]{22,}$/);
    expect(a.deviceId).not.toBe(b.deviceId);
    expect(await store.getDevice(a.deviceId)).toEqual({
      deviceId: a.deviceId,
      signingPublicKey: a.publicKey,
      createdAtMs: now,
      push: null,
    });
  });

  it("answers 400 for a missing, malformed or unparsable body", async () => {
    for (const payload of ["null", "{", "", '{"signingPublicKey":"A"}']) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/devices",
        headers: JSON_HEADERS,
        payload,
      });
      expect(response.statusCode).toBe(400);
    }
  });
});

describe("challenges", () => {
  it("are random and expire after five minutes", async () => {
    const device = await register();
    const first = await challenge(device.deviceId);
    const second = await challenge(device.deviceId);
    expect(first.nonce).not.toBe(second.nonce);
    expect(Buffer.from(first.nonce, "base64url")).toHaveLength(32);
    const stored = await store.takeChallenge(first.challengeId);
    expect(stored?.expiresAtMs).toBe(now + CHALLENGE_TTL_MS);
  });

  it("are refused for an unknown device with 404", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/devices/nope/challenges",
    });
    expect(response.statusCode).toBe(404);
  });

  it("an expired one gets 401", async () => {
    const device = await register();
    const sent = await challenge(device.deviceId);
    now += CHALLENGE_TTL_MS;
    const url = `/v1/devices/${device.deviceId}/push-token`;
    const text = buildSignedText({
      method: "PUT",
      url,
      challengeId: sent.challengeId,
      nonce: sent.nonce,
      body: Buffer.from(BODY),
    });
    const response = await app.inject({
      method: "PUT",
      url,
      headers: {
        ...JSON_HEADERS,
        "x-device-id": device.deviceId,
        "x-challenge-id": sent.challengeId,
        "x-signature": device.sign(text),
      },
      payload: BODY,
    });
    expect(response.statusCode).toBe(401);
  });

  it("a used one gets 401, even when the first request failed", async () => {
    const device = await register();
    const sent = await challenge(device.deviceId);
    const url = `/v1/devices/${device.deviceId}/push-token`;
    const send = (signature: string) =>
      app.inject({
        method: "PUT",
        url,
        headers: {
          ...JSON_HEADERS,
          "x-device-id": device.deviceId,
          "x-challenge-id": sent.challengeId,
          "x-signature": signature,
        },
        payload: BODY,
      });
    const text = buildSignedText({
      method: "PUT",
      url,
      challengeId: sent.challengeId,
      nonce: sent.nonce,
      body: Buffer.from(BODY),
    });
    expect((await send("AAAA")).statusCode).toBe(401);
    expect((await send(device.sign(text))).statusCode).toBe(401);
  });
});

describe("PUT /v1/devices/{id}/push-token", () => {
  it("stores the token for the authenticated owner", async () => {
    const device = await register();
    const response = await putToken(device, device);
    expect(response.statusCode).toBe(200);
    expect((await store.getDevice(device.deviceId))?.push).toEqual({
      platform: "fcm",
      token: "tok",
    });
  });

  it("answers 401 without a signature", async () => {
    const device = await register();
    const response = await putToken(device, device, { noSignature: true });
    expect(response.statusCode).toBe(401);
  });

  it("answers 401 for a signature of another device", async () => {
    const device = await register();
    const response = await putToken(device, device, {
      signer: await register(),
    });
    expect(response.statusCode).toBe(401);
  });

  it("answers 401 when the challenge belongs to another device", async () => {
    const device = await register();
    const response = await putToken(device, device, {
      challengeFor: await register(),
    });
    expect(response.statusCode).toBe(401);
  });

  it("answers 401 when the device record is gone", async () => {
    const device = await register();
    const sent = await challenge(device.deviceId);
    await store.deleteDevice(device.deviceId);
    const response = await app.inject({
      method: "PUT",
      url: `/v1/devices/${device.deviceId}/push-token`,
      headers: {
        ...JSON_HEADERS,
        "x-device-id": device.deviceId,
        "x-challenge-id": sent.challengeId,
        "x-signature": "AAAA",
      },
      payload: BODY,
    });
    expect(response.statusCode).toBe(401);
  });

  it.each([
    ["method", { signedMethod: "POST" }],
    ["path", { signedPath: "/v1/devices/other/push-token" }],
    ["body", { signedBody: '{"platform":"apns","pushToken":"x"}' }],
    ["context prefix", { noPrefix: true }],
  ])("answers 401 for a signature over other %s", async (_name, extra) => {
    const device = await register();
    const response = await putToken(device, device, extra);
    expect(response.statusCode).toBe(401);
  });

  it("answers 401 for a signature over another challenge", async () => {
    const device = await register();
    const signedChallenge = await challenge(device.deviceId);
    const response = await putToken(device, device, { signedChallenge });
    expect(response.statusCode).toBe(401);
  });

  it("answers 403 to another authenticated device", async () => {
    const device = await register();
    const response = await putToken(device, await register());
    expect(response.statusCode).toBe(403);
    expect((await store.getDevice(device.deviceId))?.push).toBeNull();
  });

  it("answers 400 for a signed request without a body", async () => {
    const device = await register();
    const sent = await challenge(device.deviceId);
    const url = `/v1/devices/${device.deviceId}/push-token`;
    const text = buildSignedText({
      method: "PUT",
      url,
      challengeId: sent.challengeId,
      nonce: sent.nonce,
      body: new Uint8Array(),
    });
    const response = await app.inject({
      method: "PUT",
      url,
      headers: {
        "x-device-id": device.deviceId,
        "x-challenge-id": sent.challengeId,
        "x-signature": device.sign(text),
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it("answers 400 for a wrong body", async () => {
    const device = await register();
    for (const body of [
      '{"platform":"sms","pushToken":"t"}',
      '{"platform":"fcm"}',
      "null",
    ]) {
      const response = await putToken(device, device, { body });
      expect(response.statusCode).toBe(400);
    }
  });
});
