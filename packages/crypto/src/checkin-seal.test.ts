import { beforeAll, describe, expect, it } from "vitest";
import {
  checkinAdditionalData,
  sealCheckin,
  unsealCheckin,
} from "./checkin-seal.js";
import type { CheckinSealFields } from "./checkin-seal.js";
import { createTestSodium } from "./sodium-test.js";
import type { Sodium } from "./sodium.js";

let sodium: Sodium;

beforeAll(async () => {
  sodium = await createTestSodium();
});

const FIELDS: CheckinSealFields = {
  checkinId: "checkin-1",
  authorId: "user-a",
  version: 1,
};
const PLAINTEXT = Uint8Array.from("my answers", (c) => c.charCodeAt(0));

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("sealCheckin", () => {
  it("returns a 32-byte key, a 24-byte nonce and a ciphertext", () => {
    const { key, sealed } = sealCheckin(sodium, FIELDS, PLAINTEXT);
    expect(key).toHaveLength(32);
    expect(sealed.nonce).toHaveLength(24);
    expect(sealed.ciphertext.length).toBe(PLAINTEXT.length + 16);
  });

  it("unseals with the right key", () => {
    const { key, sealed } = sealCheckin(sodium, FIELDS, PLAINTEXT);
    expect(unsealCheckin(sodium, key, FIELDS, sealed)).toEqual(PLAINTEXT);
  });

  it("rejects another check-in, author or version", () => {
    const { key, sealed } = sealCheckin(sodium, FIELDS, PLAINTEXT);
    const changed: CheckinSealFields[] = [
      { ...FIELDS, checkinId: "checkin-2" },
      { ...FIELDS, authorId: "user-b" },
      { ...FIELDS, version: 2 },
    ];
    for (const fields of changed) {
      expect(() => unsealCheckin(sodium, key, fields, sealed)).toThrow();
    }
  });

  it("rejects a boundary shifted between the ids", () => {
    const first = { checkinId: "ab", authorId: "c", version: 1 };
    const second = { checkinId: "a", authorId: "bc", version: 1 };
    const { key, sealed } = sealCheckin(sodium, first, PLAINTEXT);
    expect(() => unsealCheckin(sodium, key, second, sealed)).toThrow();
  });

  it("rejects a wrong key", () => {
    const { sealed } = sealCheckin(sodium, FIELDS, PLAINTEXT);
    const other = sodium.randomBytes(32);
    expect(() => unsealCheckin(sodium, other, FIELDS, sealed)).toThrow();
  });

  it("rejects a changed nonce or ciphertext byte", () => {
    const { key, sealed } = sealCheckin(sodium, FIELDS, PLAINTEXT);
    for (let i = 0; i < sealed.nonce.length; i++) {
      const nonce = sealed.nonce.slice();
      nonce[i] = (nonce[i] ?? 0) ^ 1;
      expect(() =>
        unsealCheckin(sodium, key, FIELDS, { ...sealed, nonce }),
      ).toThrow();
    }
    for (let i = 0; i < sealed.ciphertext.length; i++) {
      const ciphertext = sealed.ciphertext.slice();
      ciphertext[i] = (ciphertext[i] ?? 0) ^ 1;
      expect(() =>
        unsealCheckin(sodium, key, FIELDS, { ...sealed, ciphertext }),
      ).toThrow();
    }
  });

  it("rejects a wrong key or nonce length", () => {
    const { key, sealed } = sealCheckin(sodium, FIELDS, PLAINTEXT);
    expect(() => unsealCheckin(sodium, key.slice(1), FIELDS, sealed)).toThrow(
      "Invalid key length",
    );
    expect(() =>
      unsealCheckin(sodium, key, FIELDS, {
        ...sealed,
        nonce: sealed.nonce.slice(1),
      }),
    ).toThrow("Invalid nonce length");
  });

  it("gives different keys and ciphertexts for the same answers", () => {
    const one = sealCheckin(sodium, FIELDS, PLAINTEXT);
    const two = sealCheckin(sodium, FIELDS, PLAINTEXT);
    expect(hex(one.key)).not.toBe(hex(two.key));
    expect(hex(one.sealed.ciphertext)).not.toBe(hex(two.sealed.ciphertext));
  });

  it("does not unseal version 2 with the key of version 1", () => {
    const v1 = sealCheckin(sodium, FIELDS, PLAINTEXT);
    const fields2 = { ...FIELDS, version: 2 };
    const v2 = sealCheckin(sodium, fields2, PLAINTEXT);
    expect(() => unsealCheckin(sodium, v1.key, fields2, v2.sealed)).toThrow();
    expect(unsealCheckin(sodium, v2.key, fields2, v2.sealed)).toEqual(
      PLAINTEXT,
    );
  });
});

describe("checkinAdditionalData", () => {
  it("encodes the version and length-prefixed ids", () => {
    expect(hex(checkinAdditionalData(FIELDS))).toBe(
      "00000001" +
        "00000009" +
        "636865636b696e2d31" +
        "00000006" +
        "757365722d61",
    );
  });

  it("rejects an invalid version", () => {
    for (const version of [-1, 1.5, 0x100000000, Number.NaN]) {
      expect(() => checkinAdditionalData({ ...FIELDS, version })).toThrow(
        "Invalid check-in version",
      );
    }
  });
});
