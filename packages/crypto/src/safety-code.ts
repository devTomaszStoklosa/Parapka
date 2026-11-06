import type { DevicePublicKeys } from "./device-keys.js";
import type { Sodium } from "./sodium.js";

const DOMAIN = "parapka/pair-safety-code/v1\0";
const KEY_LENGTH = 32;
const HASH_LENGTH = 16;
const REDUCED_BYTES = 8;
const MODULUS = 1_000_000;

/** Reduces the first 8 bytes (big endian) modulo 10^6 without BigInt; the bias is about 2^-44. */
export function reduceToSixDigits(hash: Uint8Array): string {
  let r = 0;
  for (let i = 0; i < REDUCED_BYTES; i++) {
    r = (r * 256 + (hash[i] as number)) % MODULUS;
  }
  return r.toString().padStart(6, "0");
}

function keySet(keys: DevicePublicKeys): Uint8Array {
  if (
    keys.signing.length !== KEY_LENGTH ||
    keys.agreement.length !== KEY_LENGTH
  ) {
    throw new Error("Invalid key length");
  }
  const out = new Uint8Array(keys.signing.length + keys.agreement.length);
  out.set(keys.signing, 0);
  out.set(keys.agreement, keys.signing.length);
  return out;
}

function compare(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] as number) - (b[i] as number);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Six-digit pairing safety code (spec 7.3 step 4). The key sets are sorted
 * before hashing, so both phones get the same code whichever they pass first.
 */
export function computeSafetyCode(
  sodium: Sodium,
  own: DevicePublicKeys,
  peer: DevicePublicKeys,
): string {
  const [first, second] = [keySet(own), keySet(peer)].sort(compare) as [
    Uint8Array,
    Uint8Array,
  ];
  const domain = Uint8Array.from(DOMAIN, (char) => char.charCodeAt(0));
  const message = new Uint8Array(domain.length + first.length + second.length);
  message.set(domain, 0);
  message.set(first, domain.length);
  message.set(second, domain.length + first.length);
  return reduceToSixDigits(sodium.hash(HASH_LENGTH, message));
}
