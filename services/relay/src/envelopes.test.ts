import { generateKeyPairSync, sign } from "node:crypto";
import { ENVELOPE_TTL_MS, MAX_ENVELOPE_BYTES } from "@parapka/protocol";
import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { buildSignedText } from "./auth.js";
import { FETCH_PAGE_SIZE, purgeExpiredEnvelopes } from "./envelopes.js";
import { MemoryStore } from "./store/memory-store.js";

const START = 1_700_000_000_000;
let now = START;
let store: MemoryStore;
let app: FastifyInstance;

function start(requestsPerWindow?: number): void {
  now = START;
  store = new MemoryStore();
  app = buildApp({
    store,
    clock: { nowMs: () => now },
    ...(requestsPerWindow === undefined ? {} : { requestsPerWindow }),
  });
}

beforeEach(() => {
  start();
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

async function call(
  device: TestDevice,
  method: "GET" | "POST",
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

async function pair(): Promise<Pair> {
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

function envelopeOf(p: Pair, sender: TestDevice, id: string, extra = "") {
  return {
    envelopeId: id,
    pairMailboxId: p.mailbox,
    senderDeviceId: sender.deviceId,
    protocolVersion: 1,
    nonce: "AAAA",
    ciphertext: "BBBB" + extra,
  };
}

const send = (
  p: Pair,
  sender: TestDevice,
  envelope: unknown,
  mailbox = p.mailbox,
) => call(sender, "POST", `/v1/pairs/${mailbox}/envelopes`, { envelope });

const fetchAll = (p: Pair, device: TestDevice, after?: string) =>
  call(
    device,
    "GET",
    `/v1/pairs/${p.mailbox}/envelopes${after === undefined ? "" : `?after=${after}`}`,
  );

describe("access to the mailbox", () => {
  it("answers 403 to a device outside the mailbox", async () => {
    const p = await pair();
    const stranger = await register();
    expect(
      (await send(p, stranger, envelopeOf(p, stranger, "e1"))).statusCode,
    ).toBe(403);
    expect((await fetchAll(p, stranger)).statusCode).toBe(403);
    const ack = await call(stranger, "POST", `/v1/pairs/${p.mailbox}/acks`, {
      envelopeIds: ["e1"],
    });
    expect(ack.statusCode).toBe(403);
  });

  it("answers 403 for an unknown mailbox", async () => {
    const p = await pair();
    const response = await send(p, p.a, envelopeOf(p, p.a, "e1"), "nope");
    expect(response.statusCode).toBe(403);
  });
});

describe("POST /v1/pairs/{id}/envelopes", () => {
  it("stores a valid envelope", async () => {
    const p = await pair();
    const response = await send(p, p.a, envelopeOf(p, p.a, "e1"));
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ envelopeId: "e1", accepted: true });
  });

  it("answers 400 to an envelope that breaks the schema", async () => {
    const p = await pair();
    const broken = { ...envelopeOf(p, p.a, "e1"), nonce: 5 };
    expect((await send(p, p.a, broken)).statusCode).toBe(400);
    expect((await send(p, p.a, undefined)).statusCode).toBe(400);
  });

  it("answers 400 when the sender is not the authenticated device", async () => {
    const p = await pair();
    const response = await send(p, p.a, envelopeOf(p, p.b, "e1"));
    expect(response.statusCode).toBe(400);
  });

  it("answers 400 when pairMailboxId differs from the path", async () => {
    const p = await pair();
    const other = { ...envelopeOf(p, p.a, "e1"), pairMailboxId: "other" };
    expect((await send(p, p.a, other)).statusCode).toBe(400);
  });

  it("answers 413 to an envelope over 64 KB", async () => {
    const p = await pair();
    const big = envelopeOf(p, p.a, "e1", "A".repeat(MAX_ENVELOPE_BYTES));
    expect((await send(p, p.a, big)).statusCode).toBe(413);
  });

  it("answers 413 to a body far over the limit", async () => {
    const p = await pair();
    const huge = envelopeOf(p, p.a, "e1", "A".repeat(4 * MAX_ENVELOPE_BYTES));
    expect((await send(p, p.a, huge)).statusCode).toBe(413);
  });

  it("does not duplicate an envelope sent again", async () => {
    const p = await pair();
    await send(p, p.a, envelopeOf(p, p.a, "e1"));
    const again = await send(p, p.a, envelopeOf(p, p.a, "e1"));
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({ envelopeId: "e1", accepted: false });
    const list = (await fetchAll(p, p.b)).json<{ envelopes: unknown[] }>();
    expect(list.envelopes).toHaveLength(1);
  });
});

describe("GET /v1/pairs/{id}/envelopes", () => {
  it("returns the envelopes of the partner only, in order, after a cursor", async () => {
    const p = await pair();
    await send(p, p.a, envelopeOf(p, p.a, "e1"));
    await send(p, p.b, envelopeOf(p, p.b, "own"));
    await send(p, p.a, envelopeOf(p, p.a, "e2"));
    const body = (await fetchAll(p, p.b)).json<{
      envelopes: { cursor: string; envelope: { envelopeId: string } }[];
      nextCursor: string | null;
    }>();
    expect(body.envelopes.map((e) => e.envelope.envelopeId)).toEqual([
      "e1",
      "e2",
    ]);
    expect(body.nextCursor).toBe(body.envelopes[1]?.cursor);

    const first = body.envelopes[0]?.cursor as string;
    const rest = (await fetchAll(p, p.b, first)).json<{
      envelopes: { envelope: { envelopeId: string } }[];
    }>();
    expect(rest.envelopes.map((e) => e.envelope.envelopeId)).toEqual(["e2"]);
    const mine = (await fetchAll(p, p.a)).json<{
      envelopes: { envelope: { envelopeId: string } }[];
    }>();
    expect(mine.envelopes.map((e) => e.envelope.envelopeId)).toEqual(["own"]);
  });

  it("pages through more envelopes than one response holds", async () => {
    const p = await pair();
    const total = FETCH_PAGE_SIZE + 5;
    for (let i = 0; i < total; i += 1) {
      await store.addEnvelope(envelopeOf(p, p.a, `e${String(i)}`), now);
    }
    type Page = { envelopes: unknown[]; nextCursor: string | null };
    const first = (await fetchAll(p, p.b)).json<Page>();
    expect(first.envelopes).toHaveLength(FETCH_PAGE_SIZE);
    const second = (
      await fetchAll(p, p.b, first.nextCursor as string)
    ).json<Page>();
    expect(second.envelopes).toHaveLength(5);
    const empty = (
      await fetchAll(p, p.b, second.nextCursor as string)
    ).json<Page>();
    expect(empty).toEqual({ envelopes: [], nextCursor: null });
  });

  it("answers 400 to a malformed cursor", async () => {
    const p = await pair();
    expect((await fetchAll(p, p.b, "abc")).statusCode).toBe(400);
  });
});

describe("POST /v1/pairs/{id}/acks", () => {
  const ack = (p: Pair, device: TestDevice, envelopeIds: unknown) =>
    call(device, "POST", `/v1/pairs/${p.mailbox}/acks`, { envelopeIds });

  it("deletes acknowledged envelopes at once", async () => {
    const p = await pair();
    await send(p, p.a, envelopeOf(p, p.a, "e1"));
    await send(p, p.a, envelopeOf(p, p.a, "e2"));
    const response = await ack(p, p.b, ["e1"]);
    expect(response.json()).toEqual({ deleted: 1 });
    expect(await store.listEnvelopes(p.mailbox, null, 10)).toHaveLength(1);
  });

  it("does not delete own envelopes or those of another mailbox", async () => {
    const p = await pair();
    const q = await pair();
    await send(p, p.a, envelopeOf(p, p.a, "e1"));
    await send(q, q.a, envelopeOf(q, q.a, "x1"));
    expect((await ack(p, p.a, ["e1", "x1"])).json()).toEqual({ deleted: 0 });
    expect((await ack(p, p.b, ["x1"])).json()).toEqual({ deleted: 0 });
    expect(await store.listEnvelopes(p.mailbox, null, 10)).toHaveLength(1);
    expect(await store.listEnvelopes(q.mailbox, null, 10)).toHaveLength(1);
  });

  it("answers 400 to a malformed list", async () => {
    const p = await pair();
    expect((await ack(p, p.b, "e1")).statusCode).toBe(400);
    expect((await ack(p, p.b, [1])).statusCode).toBe(400);
  });
});

describe("expiry", () => {
  it("purges envelopes older than 30 days by the clock", async () => {
    const p = await pair();
    await send(p, p.a, envelopeOf(p, p.a, "old"));
    now += ENVELOPE_TTL_MS - 1;
    await send(p, p.a, envelopeOf(p, p.a, "new"));
    await purgeExpiredEnvelopes(store, { nowMs: () => now });
    expect(await store.listEnvelopes(p.mailbox, null, 10)).toHaveLength(2);
    now += 1;
    expect(await purgeExpiredEnvelopes(store, { nowMs: () => now })).toBe(1);
    const left = await store.listEnvelopes(p.mailbox, null, 10);
    expect(left.map((e) => e.envelope.envelopeId)).toEqual(["new"]);
  });
});

describe("rate limit", () => {
  it("answers 429 above the limit per device and recovers in a new window", async () => {
    start(3);
    const p = await pair();
    const other = await register();
    now = START;
    // pair() used other windows' counts for a and b only when in the same window.
    now += 60_000;
    for (let i = 0; i < 3; i += 1) {
      expect((await fetchAll(p, p.a)).statusCode).toBe(200);
    }
    expect((await fetchAll(p, p.a)).statusCode).toBe(429);
    expect((await fetchAll(p, p.b)).statusCode).toBe(200);
    expect((await fetchAll(p, other)).statusCode).toBe(403);
    now += 60_000;
    expect((await fetchAll(p, p.a)).statusCode).toBe(200);
  });
});
