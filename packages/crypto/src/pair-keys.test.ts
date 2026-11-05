import { beforeAll, describe, expect, it } from "vitest";
import { derivePairKeys } from "./pair-keys.js";
import { createTestSodium } from "./sodium-test.js";
import type { Sodium } from "./sodium.js";

let sodium: Sodium;

beforeAll(async () => {
  sodium = await createTestSodium();
});

describe("derivePairKeys", () => {
  it("makes the send key of one side the receive key of the other", () => {
    const inviter = sodium.kxKeyPair();
    const acceptor = sodium.kxKeyPair();
    const a = derivePairKeys(sodium, "inviter", inviter, acceptor.publicKey);
    const b = derivePairKeys(sodium, "acceptor", acceptor, inviter.publicKey);
    expect(a.sendKey).toEqual(b.receiveKey);
    expect(a.receiveKey).toEqual(b.sendKey);
    expect(a.sendKey).not.toEqual(a.receiveKey);
    expect(a.sendKey).toHaveLength(32);
  });

  it("is deterministic for the same keys and role", () => {
    const own = sodium.kxKeyPair();
    const peer = sodium.kxKeyPair();
    expect(derivePairKeys(sodium, "inviter", own, peer.publicKey)).toEqual(
      derivePairKeys(sodium, "inviter", own, peer.publicKey),
    );
  });

  it("rejects wrong key lengths", () => {
    const own = sodium.kxKeyPair();
    const peer = sodium.kxKeyPair();
    expect(() =>
      derivePairKeys(sodium, "inviter", own, peer.publicKey.slice(1)),
    ).toThrow("peer agreement public key");
    expect(() =>
      derivePairKeys(
        sodium,
        "inviter",
        { ...own, publicKey: own.publicKey.slice(1) },
        peer.publicKey,
      ),
    ).toThrow("own agreement public key");
    expect(() =>
      derivePairKeys(
        sodium,
        "inviter",
        { ...own, privateKey: own.privateKey.slice(1) },
        peer.publicKey,
      ),
    ).toThrow("own agreement private key");
  });
});
