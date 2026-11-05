import { generateKeyPairSync, sign } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { buildSignedText } from "./auth.js";
import { RecordingPushSender, SYNC_MARKER } from "./push.js";
import { MemoryStore } from "./store/memory-store.js";

let store: MemoryStore;
let pushes: RecordingPushSender;
let app: FastifyInstance;

beforeEach(async () => {
  store = new MemoryStore();
  pushes = new RecordingPushSender();
  app = buildApp({
    store,
    clock: { nowMs: () => 1_700_000_000_000 },
    pushSender: pushes,
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

async function headersFor(
  device: TestDevice,
  method: "GET" | "POST",
  url: string,
  body?: unknown,
): Promise<Record<string, string>> {
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
  return {
    ...(payload === undefined ? {} : { "content-type": "application/json" }),
    "x-device-id": device.deviceId,
    "x-challenge-id": sent.challengeId,
    "x-signature": device.sign(text),
  };
}

async function call(
  device: TestDevice,
  method: "GET" | "POST",
  url: string,
  body?: unknown,
) {
  return app.inject({
    method,
    url,
    headers: await headersFor(device, method, url, body),
    payload: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function pair() {
  const a = await register();
  const b = await register();
  const invitation = (await call(a, "POST", "/v1/invitations")).json<{
    invitationId: string;
  }>();
  const accepted = await call(
    b,
    "POST",
    `/v1/invitations/${invitation.invitationId}/accept`,
    { encryptedKeys: "SEALED" },
  );
  return {
    a,
    b,
    mailbox: accepted.json<{ pairMailboxId: string }>().pairMailboxId,
  };
}

async function connect(device: TestDevice, mailbox: string) {
  const url = `/v1/pairs/${mailbox}/ws`;
  return app.injectWS(url, { headers: await headersFor(device, "GET", url) });
}

let counter = 0;
async function sendFrom(
  sender: TestDevice,
  mailbox: string,
  envelopeId = `env-${String((counter += 1))}`,
) {
  const response = await call(
    sender,
    "POST",
    `/v1/pairs/${mailbox}/envelopes`,
    {
      envelope: {
        envelopeId,
        pairMailboxId: mailbox,
        senderDeviceId: sender.deviceId,
        protocolVersion: 1,
        nonce: "AAAA",
        ciphertext: "BBBB",
      },
    },
  );
  expect(response.statusCode).toBeLessThan(300);
}

function nextMessage(socket: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    socket.once("message", (data) => {
      resolve(Buffer.from(data as Buffer).toString("utf8"));
    });
  });
}

describe("WebSocket notification", () => {
  it("tells a connected partner about new envelopes without content", async () => {
    const p = await pair();
    const socket = await connect(p.b, p.mailbox);
    const received = nextMessage(socket);
    await sendFrom(p.a, p.mailbox);
    expect(await received).toBe(SYNC_MARKER);
    expect(pushes.sent).toEqual([]);
    socket.terminate();
  });

  it("does not notify the sender", async () => {
    const p = await pair();
    const socket = await connect(p.a, p.mailbox);
    const messages: string[] = [];
    socket.on("message", (data) => {
      messages.push(Buffer.from(data as Buffer).toString("utf8"));
    });
    await sendFrom(p.a, p.mailbox);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(messages).toEqual([]);
    socket.terminate();
  });
});

describe("push without content", () => {
  it("sends the exact marker to the partner's token", async () => {
    const p = await pair();
    const token = { platform: "fcm", token: "TOKEN-B" } as const;
    await store.setPushToken(p.b.deviceId, token);
    await sendFrom(p.a, p.mailbox);
    expect(pushes.sent).toHaveLength(1);
    expect(pushes.sent[0]?.token).toEqual(token);
    expect(pushes.sent[0]?.payload).toBe("sync");
    expect(pushes.sent[0]?.payload).toBe(SYNC_MARKER);
  });

  it("sends nothing when the partner has no push token", async () => {
    const p = await pair();
    await sendFrom(p.a, p.mailbox);
    expect(pushes.sent).toEqual([]);
  });

  it("sends nothing for a repeated envelope", async () => {
    const p = await pair();
    await store.setPushToken(p.b.deviceId, { platform: "apns", token: "T" });
    await sendFrom(p.a, p.mailbox, "same");
    await sendFrom(p.a, p.mailbox, "same");
    expect(pushes.sent).toHaveLength(1);
  });

  it("still stores the envelope when the push fails", async () => {
    const p = await pair();
    await store.setPushToken(p.b.deviceId, { platform: "fcm", token: "T" });
    pushes.send = () => Promise.reject(new Error("push down"));
    await sendFrom(p.a, p.mailbox);
    const listed = await call(p.b, "GET", `/v1/pairs/${p.mailbox}/envelopes`);
    expect(listed.statusCode).toBe(200);
  });

  it("pushes after the partner disconnects", async () => {
    const p = await pair();
    await store.setPushToken(p.b.deviceId, { platform: "apns", token: "T" });
    const socket = await connect(p.b, p.mailbox);
    socket.terminate();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await sendFrom(p.a, p.mailbox);
    expect(pushes.sent).toHaveLength(1);
  });
});

describe("WebSocket authentication", () => {
  it("rejects a connection without headers", async () => {
    const p = await pair();
    await expect(app.injectWS(`/v1/pairs/${p.mailbox}/ws`)).rejects.toThrow(
      /401/,
    );
  });

  it("rejects a wrong signature", async () => {
    const p = await pair();
    const url = `/v1/pairs/${p.mailbox}/ws`;
    const headers = await headersFor(p.b, "GET", url);
    headers["x-signature"] = Buffer.alloc(64).toString("base64");
    await expect(app.injectWS(url, { headers })).rejects.toThrow(/401/);
  });

  it("rejects a device outside the mailbox", async () => {
    const p = await pair();
    const stranger = await register();
    await expect(connect(stranger, p.mailbox)).rejects.toThrow(/403/);
  });
});
