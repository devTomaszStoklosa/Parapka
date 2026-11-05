import { beforeAll, describe, expect, it } from "vitest";
import { base64urlEncode } from "./base64url.js";
import { generateDeviceKeys } from "./device-keys.js";
import {
  decodeInvitation,
  decryptAcceptorKeys,
  encodeInvitation,
  encryptAcceptorKeys,
  generateInvitationSecret,
} from "./invitation.js";
import { createTestSodium } from "./sodium-test.js";
import type { Sodium } from "./sodium.js";

let sodium: Sodium;

beforeAll(async () => {
  sodium = await createTestSodium();
});

const ID = base64urlEncode(new Uint8Array(16).fill(7));

function makePayload() {
  const keys = generateDeviceKeys(sodium);
  return {
    invitationId: ID,
    publicKeys: {
      signing: keys.signing.publicKey,
      agreement: keys.agreement.publicKey,
    },
    secret: generateInvitationSecret(sodium),
  };
}

function bytes(length: number): string {
  return base64urlEncode(new Uint8Array(length).fill(1));
}

describe("invitation secret", () => {
  it("has 32 random bytes", () => {
    const a = generateInvitationSecret(sodium);
    expect(a).toHaveLength(32);
    expect(a).not.toEqual(generateInvitationSecret(sodium));
  });
});

describe("invitation text", () => {
  it("round-trips", () => {
    const payload = makePayload();
    const text = encodeInvitation(payload);
    expect(text.startsWith(`v1.${ID}.`)).toBe(true);
    expect(decodeInvitation(text)).toEqual(payload);
  });

  it("rejects an unknown version", () => {
    const text = encodeInvitation(makePayload()).replace("v1.", "v2.");
    expect(() => decodeInvitation(text)).toThrow("version");
  });

  it("rejects a wrong segment count", () => {
    expect(() => decodeInvitation(`v1.${ID}.${bytes(32)}`)).toThrow("format");
  });

  it("rejects a wrong key or secret length", () => {
    const k = bytes(32);
    expect(() => decodeInvitation(`v1.${ID}.${bytes(31)}.${k}.${k}`)).toThrow(
      "signing",
    );
    expect(() => decodeInvitation(`v1.${ID}.${k}.${bytes(33)}.${k}`)).toThrow(
      "agreement",
    );
    expect(() => decodeInvitation(`v1.${ID}.${k}.${k}.${bytes(16)}`)).toThrow(
      "secret",
    );
  });

  it("rejects a bad invitation id", () => {
    const k = bytes(32);
    expect(() => decodeInvitation(`v1..${k}.${k}.${k}`)).toThrow("Empty");
    expect(() => decodeInvitation(`v1.${bytes(65)}.${k}.${k}.${k}`)).toThrow(
      "too long",
    );
  });

  it("refuses to encode invalid payloads", () => {
    const payload = makePayload();
    expect(() =>
      encodeInvitation({ ...payload, secret: new Uint8Array(8) }),
    ).toThrow("secret");
    expect(() =>
      encodeInvitation({
        ...payload,
        publicKeys: { ...payload.publicKeys, signing: new Uint8Array(2) },
      }),
    ).toThrow("signing");
    expect(() =>
      encodeInvitation({
        ...payload,
        publicKeys: { ...payload.publicKeys, agreement: new Uint8Array(2) },
      }),
    ).toThrow("agreement");
  });
});

describe("acceptor keys", () => {
  const b = () => {
    const keys = generateDeviceKeys(sodium);
    return {
      signing: keys.signing.publicKey,
      agreement: keys.agreement.publicKey,
    };
  };

  it("uses a random nonce", () => {
    const secret = generateInvitationSecret(sodium);
    const keys = b();
    const one = encryptAcceptorKeys(sodium, secret, ID, keys);
    const two = encryptAcceptorKeys(sodium, secret, ID, keys);
    expect(one.nonce).toHaveLength(24);
    expect(one.nonce).not.toEqual(two.nonce);
    expect(one.ciphertext).not.toEqual(two.ciphertext);
  });

  it("does not use the secret as the cipher key", () => {
    const secret = generateInvitationSecret(sodium);
    const keys = b();
    const { nonce, ciphertext } = encryptAcceptorKeys(sodium, secret, ID, keys);
    expect(() => sodium.aeadDecrypt(ciphertext, null, nonce, secret)).toThrow();
  });

  it("rejects a changed ciphertext, nonce or invitation id", () => {
    const secret = generateInvitationSecret(sodium);
    const enc = encryptAcceptorKeys(sodium, secret, ID, b());
    const flipped = Uint8Array.from(enc.ciphertext);
    flipped[0] = (flipped[0] as number) ^ 1;
    const nonce = Uint8Array.from(enc.nonce);
    nonce[0] = (nonce[0] as number) ^ 1;
    expect(() =>
      decryptAcceptorKeys(sodium, secret, ID, { ...enc, ciphertext: flipped }),
    ).toThrow();
    expect(() =>
      decryptAcceptorKeys(sodium, secret, ID, { ...enc, nonce }),
    ).toThrow();
    expect(() => decryptAcceptorKeys(sodium, secret, bytes(16), enc)).toThrow();
  });

  it("rejects a wrong secret", () => {
    const enc = encryptAcceptorKeys(
      sodium,
      generateInvitationSecret(sodium),
      ID,
      b(),
    );
    expect(() =>
      decryptAcceptorKeys(sodium, generateInvitationSecret(sodium), ID, enc),
    ).toThrow();
  });

  it("rejects a decrypted message of the wrong length", () => {
    const secret = generateInvitationSecret(sodium);
    const key = sodium.kdfDeriveFromKey(32, 1, "pairinv1", secret);
    const nonce = sodium.randomBytes(24);
    const ad = Uint8Array.from([
      1,
      ...Uint8Array.from(ID, (c) => c.charCodeAt(0)),
    ]);
    const ciphertext = sodium.aeadEncrypt(new Uint8Array(10), ad, nonce, key);
    expect(() =>
      decryptAcceptorKeys(sodium, secret, ID, { nonce, ciphertext }),
    ).toThrow("acceptor keys");
  });
});

describe("pairing flow", () => {
  it("A invites, B answers, A reads B's keys", () => {
    const a = makePayload();
    const text = encodeInvitation(a);

    const received = decodeInvitation(text);
    const bKeys = generateDeviceKeys(sodium);
    const bPublic = {
      signing: bKeys.signing.publicKey,
      agreement: bKeys.agreement.publicKey,
    };
    const enc = encryptAcceptorKeys(
      sodium,
      received.secret,
      received.invitationId,
      bPublic,
    );

    expect(decryptAcceptorKeys(sodium, a.secret, a.invitationId, enc)).toEqual(
      bPublic,
    );
  });
});
