import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AUTH_CONTEXT_PREFIX,
  buildSignedText,
  importPublicKey,
  verifySignature,
} from "./auth.js";

function newKey(): { publicKey: string; sign(text: string): string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  return {
    publicKey: raw.toString("base64"),
    sign: (text) =>
      sign(null, Buffer.from(text), privateKey).toString("base64"),
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
    expect(importPublicKey(Buffer.alloc(31).toString("base64"))).toBeNull();
    expect(importPublicKey("not base64!")).toBeNull();
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
});
