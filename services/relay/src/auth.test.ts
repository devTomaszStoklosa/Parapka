import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AUTH_CONTEXT_PREFIX,
  buildSignedText,
  importPublicKey,
  verifySignature,
} from "./auth.js";
import { buildApp } from "./app.js";
import { MemoryStore } from "./store/memory-store.js";

function newKey(): { publicKey: string; sign(text: string): string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  return {
    publicKey: raw.toString("base64url"),
    sign: (text) =>
      sign(null, Buffer.from(text), privateKey).toString("base64url"),
  };
}

const parts = {
  method: "PUT",
  url: "/v1/devices/x/push-token",
  challengeId: "c1",
  nonce: "n1",
  body: Buffer.from("{}"),
};

describe("buildSignedText", () => {
  it("starts with the context prefix and covers every part", () => {
    const text = buildSignedText(parts);
    expect(text.startsWith(AUTH_CONTEXT_PREFIX)).toBe(true);
    expect(text).toContain("PUT\n/v1/devices/x/push-token\nc1\nn1\n");
    expect(buildSignedText({ ...parts, body: Buffer.from("[]") })).not.toBe(
      text,
    );
  });
});

describe("importPublicKey", () => {
  it("rejects keys of a wrong length or encoding", () => {
    expect(importPublicKey(Buffer.alloc(31).toString("base64url"))).toBeNull();
    expect(importPublicKey("not base64!")).toBeNull();
    const raw = Buffer.alloc(32, 0xfb);
    expect(importPublicKey(raw.toString("base64"))).toBeNull();
    expect(importPublicKey(`${raw.toString("base64url")}=`)).toBeNull();
    expect(importPublicKey(newKey().publicKey)).not.toBeNull();
  });
});

describe("verifySignature", () => {
  it("accepts a valid signature", () => {
    const key = newKey();
    const text = buildSignedText(parts);
    expect(verifySignature(key.publicKey, text, key.sign(text))).toBe(true);
  });

  it("rejects another key, changed data and a malformed key", () => {
    const key = newKey();
    const text = buildSignedText(parts);
    const signature = key.sign(text);
    expect(verifySignature(newKey().publicKey, text, signature)).toBe(false);
    expect(verifySignature(key.publicKey, text + "x", signature)).toBe(false);
    expect(verifySignature("AAAA", text, signature)).toBe(false);
  });

  it("rejects a signature in another form or of a wrong length", () => {
    const key = newKey();
    const text = buildSignedText(parts);
    const raw = Buffer.from(key.sign(text), "base64url");
    expect(verifySignature(key.publicKey, text, raw.toString("base64"))).toBe(
      false,
    );
    expect(
      verifySignature(
        key.publicKey,
        text,
        raw.subarray(1).toString("base64url"),
      ),
    ).toBe(false);
  });
});

describe("POST /v1/devices key encoding", () => {
  const raw = Buffer.alloc(32, 0xfb);
  const post = (signingPublicKey: string) =>
    buildApp({ store: new MemoryStore(), clock: { nowMs: () => 0 } }).inject({
      method: "POST",
      url: "/v1/devices",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ signingPublicKey }),
    });

  it("answers 400 for standard base64, padding and a wrong length", async () => {
    expect(raw.toString("base64")).toMatch(/[+/=]/);
    for (const key of [
      raw.toString("base64"),
      `${raw.toString("base64url")}=`,
      Buffer.alloc(31, 1).toString("base64url"),
      Buffer.alloc(33, 1).toString("base64url"),
    ]) {
      expect((await post(key)).statusCode).toBe(400);
    }
  });

  it("registers a canonical base64url key", async () => {
    const response = await post(raw.toString("base64url"));
    expect(response.statusCode).toBe(201);
  });
});
