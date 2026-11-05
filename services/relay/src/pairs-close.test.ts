import { generateKeyPairSync, sign } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { buildSignedText } from "./auth.js";
import { CLOSING_TTL_MS, purgeClosedMailboxes } from "./envelopes.js";
import { MemoryStore } from "./store/memory-store.js";

const START = 1_700_000_000_000;
let now = START;
let store: MemoryStore;
let app: FastifyInstance;
const clock = { nowMs: () => now };

beforeEach(() => {
  now = START;
  store = new MemoryStore();
  app = buildApp({ store, clock });
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

async function call(
  device: TestDevice,
  method: "GET" | "POST" | "DELETE",
  url: string,
  body?: unknown,
) {
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
      "x-signature": device.sign(text),
    },
    payload,
  });
}

interface Pair {
  a: TestDevice;
  b: TestDevice;
  mailbox: string;
}

async function pairDevices(a: TestDevice, b: TestDevice): Promise<Pair> {
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

async function pair(): Promise<Pair> {
  return pairDevices(await register(), await register());
}

const send = (p: Pair, sender: TestDevice, id: string) =>
  call(sender, "POST", `/v1/pairs/${p.mailbox}/envelopes`, {
    envelope: {
      envelopeId: id,
      pairMailboxId: p.mailbox,
      senderDeviceId: sender.deviceId,
      protocolVersion: 1,
      nonce: "AAAA",
      ciphertext: "BBBB",
    },
  });

const fetchAll = (p: Pair, device: TestDevice) =>
  call(device, "GET", `/v1/pairs/${p.mailbox}/envelopes`);

const ack = (p: Pair, device: TestDevice, ids: string[]) =>
  call(device, "POST", `/v1/pairs/${p.mailbox}/acks`, { envelopeIds: ids });

const close = (p: Pair, device: TestDevice) =>
  call(device, "DELETE", `/v1/pairs/${p.mailbox}`);

const invite = async (device: TestDevice) =>
  (await call(device, "POST", "/v1/invitations")).statusCode;

describe("closing a mailbox", () => {
  it("accepts only fetch and ack from the partner afterwards", async () => {
    const p = await pair();
    await send(p, p.a, "e1");
    expect((await close(p, p.a)).statusCode).toBe(204);
    expect((await send(p, p.a, "e2")).statusCode).toBe(410);
    expect((await send(p, p.b, "e3")).statusCode).toBe(410);
    const fetched = await fetchAll(p, p.b);
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json<{ envelopes: unknown[] }>().envelopes).toHaveLength(1);
    expect((await ack(p, p.b, ["e1"])).statusCode).toBe(200);
  });

  it("is idempotent and closed to strangers", async () => {
    const p = await pair();
    await send(p, p.a, "e1");
    expect((await close(p, p.a)).statusCode).toBe(204);
    expect((await close(p, p.a)).statusCode).toBe(204);
    const stranger = await register();
    expect((await close(p, stranger)).statusCode).toBe(403);
  });

  it("removes an empty mailbox at once", async () => {
    const p = await pair();
    await close(p, p.a);
    expect(await store.getMailbox(p.mailbox)).toBeNull();
    expect(await invite(p.a)).toBe(201);
    expect(await invite(p.b)).toBe(201);
  });

  it("removes the mailbox after the partner acks the last envelope", async () => {
    const p = await pair();
    await send(p, p.a, "e1");
    await send(p, p.a, "e2");
    await close(p, p.a);
    expect(await invite(p.a)).toBe(409);
    await ack(p, p.b, ["e1"]);
    expect(await store.getMailbox(p.mailbox)).not.toBeNull();
    await ack(p, p.b, ["e2"]);
    expect(await store.getMailbox(p.mailbox)).toBeNull();
    expect(await invite(p.a)).toBe(201);
    expect(await invite(p.b)).toBe(201);
  });

  it("removes the mailbox after 30 days by the clock", async () => {
    const p = await pair();
    await send(p, p.a, "e1");
    await close(p, p.a);
    now += CLOSING_TTL_MS - 1;
    await purgeClosedMailboxes(store, clock);
    expect(await store.getMailbox(p.mailbox)).not.toBeNull();
    now += 1;
    await purgeClosedMailboxes(store, clock);
    expect(await store.getMailbox(p.mailbox)).toBeNull();
    expect(await store.listEnvelopes(p.mailbox, null, 10)).toEqual([]);
    expect(await invite(p.b)).toBe(201);
  });
});

describe("deleting a device", () => {
  it("removes the device, its envelopes and its mailbox", async () => {
    const p = await pair();
    await send(p, p.a, "e1");
    await send(p, p.b, "e2");
    expect(
      (await call(p.a, "DELETE", `/v1/devices/${p.a.deviceId}`)).statusCode,
    ).toBe(204);
    expect(await store.getDevice(p.a.deviceId)).toBeNull();
    expect(await store.getMailbox(p.mailbox)).toBeNull();
    expect(await store.listEnvelopes(p.mailbox, null, 10)).toEqual([]);
    expect(await invite(p.b)).toBe(201);
  });

  it("answers 404 to further requests of the device", async () => {
    const p = await pair();
    await call(p.a, "DELETE", `/v1/devices/${p.a.deviceId}`);
    const response = await app.inject({
      method: "POST",
      url: `/v1/devices/${p.a.deviceId}/challenges`,
    });
    expect(response.statusCode).toBe(404);
  });

  it("does not let a device delete another one", async () => {
    const p = await pair();
    const response = await call(p.a, "DELETE", `/v1/devices/${p.b.deviceId}`);
    expect(response.statusCode).toBe(403);
    expect(await store.getDevice(p.b.deviceId)).not.toBeNull();
  });
});
