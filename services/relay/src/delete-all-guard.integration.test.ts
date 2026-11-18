import { base64urlEncode } from "@parapka/crypto";
import { buildSignedText } from "@parapka/protocol";
import { Writable } from "node:stream";
import { afterEach, beforeEach, expect, it } from "vitest";
import { webSha256 } from "../../../apps/mobile/src/platform/sha256";
import { loggerOptions } from "./logging.js";
import {
  createPairWorld,
  deleteAllOf,
  type PairWorld,
} from "./pair-test-support.js";
import { MemoryStore } from "./store/memory-store.js";

let world: PairWorld;
let store: MemoryStore;
let lines: string[];

beforeEach(async () => {
  lines = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      lines.push(...String(chunk).split("\n").filter(Boolean));
      done();
    },
  });
  store = new MemoryStore();
  world = await createPairWorld({
    store,
    logger: loggerOptions(stream),
  });
});

afterEach(() => world.app.close());

const challengeOf = (deviceId: string) =>
  world.app.inject({
    method: "POST",
    url: `/v1/devices/${deviceId}/challenges`,
  });

it("does not let B delete A, and refuses an unsigned request", async () => {
  const a = await world.newDevice("a");
  const b = await world.newDevice("b");
  await world.pair(a, b);
  const url = `/v1/devices/${a.deviceId}`;

  // B signs the request with its own key, so only the owner check can refuse.
  const { challengeId, nonce } = (await challengeOf(b.deviceId)).json<{
    challengeId: string;
    nonce: string;
  }>();
  const hash = Array.from(await webSha256(new Uint8Array()), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
  const text = buildSignedText({
    method: "DELETE",
    url,
    challengeId,
    nonce,
    bodyHashHex: hash,
  });
  const signature = base64urlEncode(
    world.sodium.sign(
      new TextEncoder().encode(text),
      b.credentials.signingPrivateKey,
    ),
  );
  const foreign = await world.app.inject({
    method: "DELETE",
    url,
    headers: {
      "X-Device-Id": b.deviceId,
      "X-Challenge-Id": challengeId,
      "X-Signature": signature,
    },
  });
  expect(foreign.statusCode).toBe(403);
  expect((await challengeOf(a.deviceId)).statusCode).toBe(201);

  const unsigned = await world.app.inject({ method: "DELETE", url });
  expect(unsigned.statusCode).toBe(401);
  expect((await challengeOf(a.deviceId)).statusCode).toBe(201);
});

it("logs only route patterns during the whole delete-all scenario", async () => {
  const a = await world.newDevice("a");
  const b = await world.newDevice("b");
  const { pairMailboxId } = await world.pair(a, b);
  await world.exchangeProfiles(a, b);
  const publicKey = (await store.getDevice(a.deviceId))?.signingPublicKey;
  expect(publicKey).toBeTruthy();
  const pushToken = "push-token-unique-for-the-log-test";
  await a.client.setPushToken({ platform: "fcm", pushToken });

  expect(await deleteAllOf(a)).toBe("done");
  await world.expectEndedByPartner(b);
  const waiting = await b.client.fetchEnvelopes(pairMailboxId, null);
  await b.client.ack(
    pairMailboxId,
    waiting.envelopes.map((e) => e.envelope.envelopeId),
  );

  const entries = lines.map(
    (line) => JSON.parse(line) as { req?: { method: string; url: string } },
  );
  const requests = entries.flatMap((e) => (e.req === undefined ? [] : [e.req]));
  expect(requests).toContainEqual({ method: "DELETE", url: "/v1/devices/:id" });
  expect(requests).toContainEqual({
    method: "PUT",
    url: "/v1/devices/:id/push-token",
  });
  expect(requests).toContainEqual({
    method: "GET",
    url: "/v1/pairs/:id/envelopes",
  });
  for (const request of requests)
    expect(request.url).toMatch(/^(\/v1\/[a-z:/-]+|unmatched)$/);

  const text = lines.join("\n");
  for (const secret of [
    a.deviceId,
    b.deviceId,
    pairMailboxId,
    publicKey,
    pushToken,
  ]) {
    expect(text).not.toContain(secret as string);
  }
});
