import { beforeAll, describe, expect, it } from "vitest";
import {
  decodeDevicePublicKeys,
  encodeDevicePublicKeys,
  generateDeviceKeys,
} from "./device-keys.js";
import { createTestSodium } from "./sodium-test.js";
import type { Sodium } from "./sodium.js";

let sodium: Sodium;

beforeAll(async () => {
  sodium = await createTestSodium();
});

describe("device keys", () => {
  it("generates Ed25519 and X25519 pairs", () => {
    const keys = generateDeviceKeys(sodium);
    expect(keys.signing.publicKey).toHaveLength(32);
    expect(keys.signing.privateKey).toHaveLength(64);
    expect(keys.agreement.publicKey).toHaveLength(32);
    expect(keys.agreement.privateKey).toHaveLength(32);
    const other = generateDeviceKeys(sodium);
    expect(other.signing.publicKey).not.toEqual(keys.signing.publicKey);
  });

  it("round-trips public keys as 43-character text", () => {
    const keys = generateDeviceKeys(sodium);
    const pub = {
      signing: keys.signing.publicKey,
      agreement: keys.agreement.publicKey,
    };
    const encoded = encodeDevicePublicKeys(pub);
    expect(encoded.signing).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(decodeDevicePublicKeys(encoded)).toEqual(pub);
  });

  it("rejects bad text and wrong lengths", () => {
    const good = "A".repeat(43);
    expect(() =>
      decodeDevicePublicKeys({ signing: good + "=", agreement: good }),
    ).toThrow();
    expect(() =>
      decodeDevicePublicKeys({ signing: "A".repeat(42), agreement: good }),
    ).toThrow();
    expect(() =>
      decodeDevicePublicKeys({ signing: good, agreement: "A".repeat(44) }),
    ).toThrow();
    expect(() =>
      decodeDevicePublicKeys({ signing: good, agreement: "!".repeat(43) }),
    ).toThrow();
  });
});
