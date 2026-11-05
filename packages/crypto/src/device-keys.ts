import { base64urlDecode, base64urlEncode } from "./base64url.js";
import type { KeyPair, Sodium } from "./sodium.js";

const PUBLIC_KEY_LENGTH = 32;

/** Device keys made on first launch (spec 7.3 step 1). Storing them is up to the app. */
export interface DeviceKeys {
  /** Ed25519 signing key pair. */
  readonly signing: KeyPair;
  /** X25519 key agreement key pair. */
  readonly agreement: KeyPair;
}

export interface DevicePublicKeys {
  readonly signing: Uint8Array;
  readonly agreement: Uint8Array;
}

/** Text form of public keys: base64url without padding. */
export interface DevicePublicKeysText {
  readonly signing: string;
  readonly agreement: string;
}

export function generateDeviceKeys(sodium: Sodium): DeviceKeys {
  return { signing: sodium.signKeyPair(), agreement: sodium.kxKeyPair() };
}

export function encodeDevicePublicKeys(
  keys: DevicePublicKeys,
): DevicePublicKeysText {
  return {
    signing: base64urlEncode(keys.signing),
    agreement: base64urlEncode(keys.agreement),
  };
}

function decodePublicKey(text: string, name: string): Uint8Array {
  const bytes = base64urlDecode(text);
  if (bytes.length !== PUBLIC_KEY_LENGTH) {
    throw new Error(`Invalid ${name} public key length`);
  }
  return bytes;
}

/** Throws on a bad alphabet, padding or length. */
export function decodeDevicePublicKeys(
  text: DevicePublicKeysText,
): DevicePublicKeys {
  return {
    signing: decodePublicKey(text.signing, "signing"),
    agreement: decodePublicKey(text.agreement, "agreement"),
  };
}
