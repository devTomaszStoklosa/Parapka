import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { loggerOptions } from "./logging.js";
import { MemoryStore } from "./store/memory-store.js";

describe("request log", () => {
  it("holds no envelope content, signature, push token or IP", async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString("utf8"));
        done();
      },
    });
    const app = buildApp({
      store: new MemoryStore(),
      clock: { nowMs: () => 0 },
      logger: loggerOptions(stream),
    });
    await app.inject({
      method: "POST",
      url: "/v1/pairs/p1/envelopes?token=QUERYSECRET",
      remoteAddress: "203.0.113.77",
      headers: {
        "content-type": "application/json",
        "x-device-id": "dev",
        "x-signature": "SIGNATURE-VALUE",
        "x-push-token": "PUSHTOKEN-VALUE",
      },
      payload: JSON.stringify({
        envelope: { ciphertext: "CIPHERTEXT-VALUE", nonce: "NONCE-VALUE" },
      }),
    });
    await app.close();

    const log = lines.join("");
    expect(log).toContain("/v1/pairs/p1/envelopes");
    for (const secret of [
      "CIPHERTEXT-VALUE",
      "NONCE-VALUE",
      "SIGNATURE-VALUE",
      "PUSHTOKEN-VALUE",
      "QUERYSECRET",
      "203.0.113.77",
      "remoteAddress",
      "remotePort",
    ]) {
      expect(log).not.toContain(secret);
    }
  });

  it("holds no authentication query parameter of the WebSocket route", async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString("utf8"));
        done();
      },
    });
    const app = buildApp({
      store: new MemoryStore(),
      clock: { nowMs: () => 0 },
      logger: loggerOptions(stream),
    });
    await app.ready();
    await app
      .injectWS(
        "/v1/pairs/p1/ws?deviceId=DEVICE-VALUE&challengeId=CHALLENGE-VALUE&signature=SIGNATURE-VALUE",
      )
      .catch(() => undefined);
    await app.close();

    const log = lines.join("");
    expect(log).toContain("/v1/pairs/p1/ws");
    for (const secret of [
      "DEVICE-VALUE",
      "CHALLENGE-VALUE",
      "SIGNATURE-VALUE",
      "signature=",
    ]) {
      expect(log).not.toContain(secret);
    }
  });

  it("holds no body fragment when the JSON is invalid", async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString("utf8"));
        done();
      },
    });
    const app = buildApp({
      store: new MemoryStore(),
      clock: { nowMs: () => 0 },
      logger: loggerOptions(stream),
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/pairs/p1/envelopes",
      headers: { "content-type": "application/json" },
      payload: '{"envelope":{"ciphertext":"CIPHERTEXT-VALUE","nonce":',
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    const log = lines.join("");
    expect(log).not.toContain("CIPHERTEXT-VALUE");
    expect(log).not.toContain("ciphertext");
  });
});
