import { beforeAll, describe, expect, it } from "vitest";
import type { Sodium } from "@parapka/crypto";
import { createWebSodium } from "./web-sodium";

let api: Sodium;

beforeAll(async () => {
  api = await createWebSodium();
});

function fromHex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/../g) ?? [], (byte) =>
    parseInt(byte, 16),
  );
}

function asHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const text = (value: string) =>
  Uint8Array.from(value, (char) => char.charCodeAt(0));

// draft-irtf-cfrg-xchacha-03, Appendix A.3.1 (AEAD_XChaCha20_Poly1305 test vector).
const vector = {
  plaintext: text(
    "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.",
  ),
  aad: fromHex("50515253c0c1c2c3c4c5c6c7"),
  key: fromHex(
    "808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f",
  ),
  nonce: fromHex("404142434445464748494a4b4c4d4e4f5051525354555657"),
  ciphertext: fromHex(
    "bd6d179d3e83d43b9576579493c0e939572a1700252bfaccbed2902c21396cbb" +
      "731c7f1b0b4aa6440bf3a82f4eda7e39ae64c6708c54c216cb96b72e1213b452" +
      "2f8c9ba40db5d945b11b69b982c1bb9e3f3fac2bc369488f76b2383565d3fff9" +
      "21f9664c97637da9768812f615c68b13b52e",
  ),
  tag: fromHex("c0875924c1c7987947deafd8780acf49"),
};

describe("XChaCha20-Poly1305 IETF", () => {
  it("matches the draft-irtf-cfrg-xchacha-03 A.3.1 vector", () => {
    const encrypted = api.aeadEncrypt(
      vector.plaintext,
      vector.aad,
      vector.nonce,
      vector.key,
    );
    expect(asHex(encrypted)).toBe(asHex(vector.ciphertext) + asHex(vector.tag));
  });

  it("decrypts the vector", () => {
    const sealed = new Uint8Array([...vector.ciphertext, ...vector.tag]);
    const decrypted = api.aeadDecrypt(
      sealed,
      vector.aad,
      vector.nonce,
      vector.key,
    );
    expect(decrypted).toEqual(vector.plaintext);
  });

  const sealed = () => new Uint8Array([...vector.ciphertext, ...vector.tag]);

  it("throws for a changed ciphertext", () => {
    const changed = sealed();
    changed[0] = (changed[0] ?? 0) ^ 1;
    expect(() =>
      api.aeadDecrypt(changed, vector.aad, vector.nonce, vector.key),
    ).toThrow();
  });

  it("throws for a changed nonce", () => {
    const nonce = vector.nonce.slice();
    nonce[0] = (nonce[0] ?? 0) ^ 1;
    expect(() =>
      api.aeadDecrypt(sealed(), vector.aad, nonce, vector.key),
    ).toThrow();
  });

  it("throws for changed additional data", () => {
    const aad = vector.aad.slice();
    aad[0] = (aad[0] ?? 0) ^ 1;
    expect(() =>
      api.aeadDecrypt(sealed(), aad, vector.nonce, vector.key),
    ).toThrow();
  });
});

describe("BLAKE2b", () => {
  it("matches RFC 7693 Appendix A (BLAKE2b-512 of 'abc')", () => {
    expect(asHex(api.hash(64, text("abc")))).toBe(
      "ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d1" +
        "7d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923",
    );
  });

  // Official BLAKE2 known answer tests, blake2b-kat.txt (keyed variant):
  // key = 00 01 02 ... 3f, 64-byte output.
  const key = Uint8Array.from({ length: 64 }, (_, i) => i);

  it("matches the blake2b-kat.txt keyed vector for empty input", () => {
    expect(asHex(api.hash(64, new Uint8Array(0), key))).toBe(
      "10ebb67700b1868efb4417987acf4690ae9d972fb7a590c2f02871799aaa4786" +
        "b5e996e8f0f4eb981fc214b005f42d2ff4233499391653df7aefcbc13fc51568",
    );
  });

  it("matches the blake2b-kat.txt keyed vector for input 00", () => {
    expect(asHex(api.hash(64, fromHex("00"), key))).toBe(
      "961f6dd1e4dd30f63901690c512e78e4b45e4742ed197c3c5e45c549fd25f2e4" +
        "187b0bc9fe30492b16b0d0bc4ef9b0f34c7003fac09a5ef1532e69430234cebd",
    );
  });
});

describe("Ed25519 signatures", () => {
  it("accepts a valid signature", () => {
    const { publicKey, privateKey } = api.signKeyPair();
    const signature = api.sign(text("message"), privateKey);
    expect(api.verify(signature, text("message"), publicKey)).toBe(true);
  });

  it("rejects a changed message", () => {
    const { publicKey, privateKey } = api.signKeyPair();
    const signature = api.sign(text("message"), privateKey);
    expect(api.verify(signature, text("messagf"), publicKey)).toBe(false);
  });
});

describe("crypto_kx", () => {
  it("gives the client and the server matching session keys", () => {
    const client = api.kxKeyPair();
    const server = api.kxKeyPair();
    const clientKeys = api.kxClientSessionKeys(
      client.publicKey,
      client.privateKey,
      server.publicKey,
    );
    const serverKeys = api.kxServerSessionKeys(
      server.publicKey,
      server.privateKey,
      client.publicKey,
    );
    expect(clientKeys.sharedRx).toEqual(serverKeys.sharedTx);
    expect(clientKeys.sharedTx).toEqual(serverKeys.sharedRx);
  });
});

describe("crypto_kdf_derive_from_key", () => {
  it("is deterministic and depends on the subkey id", () => {
    const key = api.randomBytes(32);
    const first = api.kdfDeriveFromKey(32, 1, "parapka1", key);
    expect(api.kdfDeriveFromKey(32, 1, "parapka1", key)).toEqual(first);
    expect(api.kdfDeriveFromKey(32, 2, "parapka1", key)).not.toEqual(first);
  });
});

describe("randomBytes", () => {
  it("returns the requested length", () => {
    expect(api.randomBytes(24)).toHaveLength(24);
  });
});
