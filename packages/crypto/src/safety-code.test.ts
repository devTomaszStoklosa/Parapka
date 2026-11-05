import { beforeAll, describe, expect, it } from "vitest";
import { generateDeviceKeys } from "./device-keys.js";
import type { DevicePublicKeys } from "./device-keys.js";
import { computeSafetyCode, reduceToSixDigits } from "./safety-code.js";
import { createTestSodium } from "./sodium-test.js";
import type { Sodium } from "./sodium.js";

let sodium: Sodium;

beforeAll(async () => {
  sodium = await createTestSodium();
});

function fixed(seed: number): DevicePublicKeys {
  return {
    signing: Uint8Array.from({ length: 32 }, (_, i) => (seed + i) % 256),
    agreement: Uint8Array.from(
      { length: 32 },
      (_, i) => (seed * 3 + i + 100) % 256,
    ),
  };
}

function random(): DevicePublicKeys {
  const keys = generateDeviceKeys(sodium);
  return {
    signing: keys.signing.publicKey,
    agreement: keys.agreement.publicKey,
  };
}

function clone(keys: DevicePublicKeys): {
  signing: Uint8Array;
  agreement: Uint8Array;
} {
  return { signing: keys.signing.slice(), agreement: keys.agreement.slice() };
}

describe("computeSafetyCode", () => {
  it("handles identical key sets", () => {
    const keys = fixed(7);
    expect(computeSafetyCode(sodium, keys, clone(keys))).toMatch(/^\d{6}$/);
  });

  it("matches a fixed test vector", () => {
    expect(computeSafetyCode(sodium, fixed(1), fixed(2))).toBe("083830");
  });

  it("is symmetric", () => {
    for (let i = 0; i < 20; i++) {
      const a = random();
      const b = random();
      expect(computeSafetyCode(sodium, a, b)).toBe(
        computeSafetyCode(sodium, b, a),
      );
    }
  });

  it("changes when any byte of any key changes", () => {
    const a = fixed(1);
    const b = fixed(2);
    const base = computeSafetyCode(sodium, a, b);
    for (const index of [0, 1, 15, 31]) {
      for (const field of ["signing", "agreement"] as const) {
        const a2 = clone(a);
        a2[field][index] = (a2[field][index] as number) ^ 1;
        expect(computeSafetyCode(sodium, a2, b)).not.toBe(base);
        const b2 = clone(b);
        b2[field][index] = (b2[field][index] as number) ^ 1;
        expect(computeSafetyCode(sodium, a, b2)).not.toBe(base);
      }
    }
  });

  it("always has 6 digits", () => {
    for (let i = 0; i < 200; i++) {
      expect(computeSafetyCode(sodium, random(), random())).toMatch(/^\d{6}$/);
    }
  });
});

describe("reduceToSixDigits", () => {
  it("keeps leading zeros", () => {
    expect(reduceToSixDigits(Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 42]))).toBe(
      "000042",
    );
    expect(reduceToSixDigits(new Uint8Array(16))).toBe("000000");
  });

  it("reduces 8 bytes modulo 10^6", () => {
    const bytes = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
    const expected = (0x0102030405060708n % 1000000n)
      .toString()
      .padStart(6, "0");
    expect(reduceToSixDigits(bytes)).toBe(expected);
  });
});
