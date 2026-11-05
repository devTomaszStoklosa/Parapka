import { beforeAll, describe, expect, it } from "vitest";
import {
  decryptEnvelope,
  encryptEnvelope,
  envelopeAdditionalData,
} from "./envelope.js";
import type { EnvelopeFields } from "./envelope.js";
import { derivePairKeys } from "./pair-keys.js";
import { createTestSodium } from "./sodium-test.js";
import type { Sodium } from "./sodium.js";

let sodium: Sodium;

beforeAll(async () => {
  sodium = await createTestSodium();
});

const FIELDS: EnvelopeFields = {
  envelopeId: "env-1",
  pairMailboxId: "mailbox-1",
  senderDeviceId: "device-a",
  protocolVersion: 1,
};
const PLAINTEXT = Uint8Array.from("hello parapka", (c) => c.charCodeAt(0));

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function ascii(text: string): string {
  return hex(Uint8Array.from(text, (c) => c.charCodeAt(0)));
}

function pairKeys() {
  const inviter = sodium.kxKeyPair();
  const acceptor = sodium.kxKeyPair();
  return {
    a: derivePairKeys(sodium, "inviter", inviter, acceptor.publicKey),
    b: derivePairKeys(sodium, "acceptor", acceptor, inviter.publicKey),
  };
}

function flip(bytes: Uint8Array, index: number): Uint8Array {
  const copy = bytes.slice();
  copy[index] = (copy[index] ?? 0) ^ 1;
  return copy;
}

describe("envelopeAdditionalData", () => {
  it("encodes version and length-prefixed fields in a fixed order", () => {
    expect(hex(envelopeAdditionalData(FIELDS))).toBe(
      "0001" +
        "00000005" +
        ascii("env-1") +
        "00000009" +
        ascii("mailbox-1") +
        "00000008" +
        ascii("device-a"),
    );
  });

  it("differs when a boundary between fields moves", () => {
    const a = envelopeAdditionalData({
      ...FIELDS,
      envelopeId: "ab",
      pairMailboxId: "c",
    });
    const b = envelopeAdditionalData({
      ...FIELDS,
      envelopeId: "a",
      pairMailboxId: "bc",
    });
    expect(a).not.toEqual(b);
  });

  it("encodes non-ASCII text as UTF-8 and rejects lone surrogates", () => {
    const data = envelopeAdditionalData({
      ...FIELDS,
      envelopeId: "\u00e9\u20ac\u{1f600}",
    });
    expect(hex(data).slice(4, 4 + 8 + 18)).toBe(
      "00000009" + "c3a9" + "e282ac" + "f09f9880",
    );
    expect(() =>
      envelopeAdditionalData({ ...FIELDS, envelopeId: "\ud800" }),
    ).toThrow("Invalid text");
  });

  it("rejects an invalid protocol version", () => {
    for (const protocolVersion of [-1, 1.5, 0x10000]) {
      expect(() =>
        envelopeAdditionalData({ ...FIELDS, protocolVersion }),
      ).toThrow("protocol version");
    }
  });
});

describe("envelope encryption", () => {
  it("round-trips from A to B and back", () => {
    const { a, b } = pairKeys();
    const toB = encryptEnvelope(sodium, a.sendKey, FIELDS, PLAINTEXT);
    expect(decryptEnvelope(sodium, b.receiveKey, FIELDS, toB)).toEqual(
      PLAINTEXT,
    );
    const toA = encryptEnvelope(sodium, b.sendKey, FIELDS, PLAINTEXT);
    expect(decryptEnvelope(sodium, a.receiveKey, FIELDS, toA)).toEqual(
      PLAINTEXT,
    );
  });

  it("uses a fresh 24-byte nonce each time", () => {
    const { a } = pairKeys();
    const one = encryptEnvelope(sodium, a.sendKey, FIELDS, PLAINTEXT);
    const two = encryptEnvelope(sodium, a.sendKey, FIELDS, PLAINTEXT);
    expect(one.nonce).toHaveLength(24);
    expect(one.nonce).not.toEqual(two.nonce);
  });

  it("fails when any plaintext field changes", () => {
    const { a, b } = pairKeys();
    const enc = encryptEnvelope(sodium, a.sendKey, FIELDS, PLAINTEXT);
    const changed: EnvelopeFields[] = [
      { ...FIELDS, envelopeId: "env-2" },
      { ...FIELDS, pairMailboxId: "mailbox-2" },
      { ...FIELDS, senderDeviceId: "device-b" },
      { ...FIELDS, protocolVersion: 2 },
    ];
    for (const fields of changed) {
      expect(() =>
        decryptEnvelope(sodium, b.receiveKey, fields, enc),
      ).toThrow();
    }
  });

  it("fails when the nonce or any ciphertext byte changes", () => {
    const { a, b } = pairKeys();
    const enc = encryptEnvelope(sodium, a.sendKey, FIELDS, PLAINTEXT);
    for (let i = 0; i < enc.nonce.length; i++) {
      expect(() =>
        decryptEnvelope(sodium, b.receiveKey, FIELDS, {
          ...enc,
          nonce: flip(enc.nonce, i),
        }),
      ).toThrow();
    }
    for (let i = 0; i < enc.ciphertext.length; i++) {
      expect(() =>
        decryptEnvelope(sodium, b.receiveKey, FIELDS, {
          ...enc,
          ciphertext: flip(enc.ciphertext, i),
        }),
      ).toThrow();
    }
  });

  it("does not decrypt with the send key of the other side", () => {
    const { a, b } = pairKeys();
    const enc = encryptEnvelope(sodium, a.sendKey, FIELDS, PLAINTEXT);
    expect(() => decryptEnvelope(sodium, b.sendKey, FIELDS, enc)).toThrow();
    expect(() => decryptEnvelope(sodium, a.receiveKey, FIELDS, enc)).toThrow();
  });

  it("rejects a wrong key or nonce length", () => {
    const { a, b } = pairKeys();
    const enc = encryptEnvelope(sodium, a.sendKey, FIELDS, PLAINTEXT);
    expect(() =>
      encryptEnvelope(sodium, a.sendKey.slice(1), FIELDS, PLAINTEXT),
    ).toThrow("key length");
    expect(() =>
      decryptEnvelope(sodium, b.receiveKey.slice(1), FIELDS, enc),
    ).toThrow("key length");
    expect(() =>
      decryptEnvelope(sodium, b.receiveKey, FIELDS, {
        ...enc,
        nonce: enc.nonce.slice(1),
      }),
    ).toThrow("nonce length");
  });

  it("matches the stored test vector", () => {
    const key = Uint8Array.from({ length: 32 }, (_, i) => i);
    const nonce = Uint8Array.from({ length: 24 }, (_, i) => 0xa0 + i);
    const fixed: Sodium = { ...sodium, randomBytes: () => nonce };
    const enc = encryptEnvelope(fixed, key, FIELDS, PLAINTEXT);
    expect(hex(enc.nonce)).toBe(hex(nonce));
    expect(hex(enc.ciphertext)).toBe(
      "2d896671d87dd4cd130e5de210890f12501903002ef7429e82aa0c4175",
    );
    expect(decryptEnvelope(sodium, key, FIELDS, enc)).toEqual(PLAINTEXT);
  });
});
