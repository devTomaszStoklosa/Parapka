import { utf8 } from "./envelope.js";
import type { Sodium } from "./sodium.js";

const KEY_LENGTH = 32;
const NONCE_LENGTH = 24;
const MAX_VERSION = 0xffffffff;

/** Fields that bind a sealed version to its check-in, author and version (spec 7.4). */
export interface CheckinSealFields {
  readonly checkinId: string;
  readonly authorId: string;
  readonly version: number;
}

export interface SealedCheckin {
  readonly nonce: Uint8Array;
  readonly ciphertext: Uint8Array;
}

export interface SealResult {
  readonly key: Uint8Array;
  readonly sealed: SealedCheckin;
}

/**
 * Canonical bytes of the seal fields: the version as uint32 BE, then checkinId
 * and authorId, each as UTF-8 with a uint32 BE length prefix. The prefixes make
 * the boundaries unambiguous.
 */
export function checkinAdditionalData(fields: CheckinSealFields): Uint8Array {
  const { version } = fields;
  if (!Number.isInteger(version) || version < 0 || version > MAX_VERSION) {
    throw new Error("Invalid check-in version");
  }
  const texts = [fields.checkinId, fields.authorId].map(utf8);
  const length = 4 + texts.reduce((sum, text) => sum + 4 + text.length, 0);
  const result = new Uint8Array(length);
  const view = new DataView(result.buffer);
  view.setUint32(0, version);
  let offset = 4;
  for (const text of texts) {
    view.setUint32(offset, text.length);
    result.set(text, offset + 4);
    offset += 4 + text.length;
  }
  return result;
}

function checkKey(key: Uint8Array): void {
  if (key.length !== KEY_LENGTH) {
    throw new Error("Invalid key length");
  }
}

/**
 * Seals the answers of one check-in version with a fresh random key. The caller
 * decides when to send the key; this module only encrypts.
 */
export function sealCheckin(
  sodium: Sodium,
  fields: CheckinSealFields,
  plaintext: Uint8Array,
): SealResult {
  const additionalData = checkinAdditionalData(fields);
  const key = sodium.randomBytes(KEY_LENGTH);
  const nonce = sodium.randomBytes(NONCE_LENGTH);
  const ciphertext = sodium.aeadEncrypt(plaintext, additionalData, nonce, key);
  return { key, sealed: { nonce, ciphertext } };
}

/** Throws when a field, the nonce or the ciphertext was changed, or the key is wrong. */
export function unsealCheckin(
  sodium: Sodium,
  key: Uint8Array,
  fields: CheckinSealFields,
  sealed: SealedCheckin,
): Uint8Array {
  checkKey(key);
  if (sealed.nonce.length !== NONCE_LENGTH) {
    throw new Error("Invalid nonce length");
  }
  return sodium.aeadDecrypt(
    sealed.ciphertext,
    checkinAdditionalData(fields),
    sealed.nonce,
    key,
  );
}
