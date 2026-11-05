import type { Sodium } from "./sodium.js";

const KEY_LENGTH = 32;
const NONCE_LENGTH = 24;
const MAX_PROTOCOL_VERSION = 0xffff;

/** Envelope fields the relay sees; they authenticate the ciphertext (spec 7.4). */
export interface EnvelopeFields {
  readonly envelopeId: string;
  readonly pairMailboxId: string;
  readonly senderDeviceId: string;
  readonly protocolVersion: number;
}

export interface EncryptedEnvelope {
  readonly nonce: Uint8Array;
  readonly ciphertext: Uint8Array;
}

/** UTF-8 bytes of a text; the runtime types here have no `TextEncoder`. */
function utf8(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 0xd800 && code <= 0xdfff) {
      throw new Error("Invalid text in envelope field");
    }
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

/**
 * Canonical bytes of the plaintext fields: the protocol version as uint16 BE,
 * then envelopeId, pairMailboxId and senderDeviceId, each as UTF-8 with a
 * uint32 BE length prefix. The order is fixed and the prefixes make the
 * boundaries unambiguous.
 */
export function envelopeAdditionalData(fields: EnvelopeFields): Uint8Array {
  const { protocolVersion } = fields;
  if (
    !Number.isInteger(protocolVersion) ||
    protocolVersion < 0 ||
    protocolVersion > MAX_PROTOCOL_VERSION
  ) {
    throw new Error("Invalid protocol version");
  }
  const texts = [
    fields.envelopeId,
    fields.pairMailboxId,
    fields.senderDeviceId,
  ].map(utf8);
  const length = 2 + texts.reduce((sum, text) => sum + 4 + text.length, 0);
  const result = new Uint8Array(length);
  const view = new DataView(result.buffer);
  view.setUint16(0, protocolVersion);
  let offset = 2;
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

/** Encrypts content bytes with the send key and a fresh random 24-byte nonce. */
export function encryptEnvelope(
  sodium: Sodium,
  sendKey: Uint8Array,
  fields: EnvelopeFields,
  plaintext: Uint8Array,
): EncryptedEnvelope {
  checkKey(sendKey);
  const additionalData = envelopeAdditionalData(fields);
  const nonce = sodium.randomBytes(NONCE_LENGTH);
  const ciphertext = sodium.aeadEncrypt(
    plaintext,
    additionalData,
    nonce,
    sendKey,
  );
  return { nonce, ciphertext };
}

/** Throws when a field, the nonce or the ciphertext was changed, or the key is wrong. */
export function decryptEnvelope(
  sodium: Sodium,
  receiveKey: Uint8Array,
  fields: EnvelopeFields,
  encrypted: EncryptedEnvelope,
): Uint8Array {
  checkKey(receiveKey);
  if (encrypted.nonce.length !== NONCE_LENGTH) {
    throw new Error("Invalid nonce length");
  }
  return sodium.aeadDecrypt(
    encrypted.ciphertext,
    envelopeAdditionalData(fields),
    encrypted.nonce,
    receiveKey,
  );
}
