import { base64urlDecode, base64urlEncode } from "./base64url.js";
import type { DevicePublicKeys } from "./device-keys.js";
import type { Sodium } from "./sodium.js";

const PROTOCOL_VERSION = 1;
const VERSION_PREFIX = "v1";
const SECRET_LENGTH = 32;
const KEY_LENGTH = 32;
const NONCE_LENGTH = 24;
const MAX_INVITATION_ID_LENGTH = 64;
const KDF_CONTEXT = "pairinv1";
const KDF_SUBKEY_ID = 1;

/** What the QR code and the link of an invitation carry (spec 7.3 step 2). */
export interface InvitationPayload {
  readonly invitationId: string;
  readonly publicKeys: DevicePublicKeys;
  readonly secret: Uint8Array;
}

/** Public keys of the accepting side, encrypted with the invitation secret. */
export interface EncryptedAcceptorKeys {
  readonly nonce: Uint8Array;
  readonly ciphertext: Uint8Array;
}

export function generateInvitationSecret(sodium: Sodium): Uint8Array {
  return sodium.randomBytes(SECRET_LENGTH);
}

function checkInvitationId(invitationId: string): void {
  if (invitationId.length === 0) {
    throw new Error("Empty invitation id");
  }
  if (base64urlDecode(invitationId).length > MAX_INVITATION_ID_LENGTH) {
    throw new Error("Invitation id too long");
  }
}

function checkLength(bytes: Uint8Array, length: number, name: string): void {
  if (bytes.length !== length) {
    throw new Error(`Invalid ${name} length`);
  }
}

/** Text form for the QR code and the link: `v1.<id>.<signing>.<agreement>.<secret>`. */
export function encodeInvitation(payload: InvitationPayload): string {
  checkInvitationId(payload.invitationId);
  checkLength(payload.publicKeys.signing, KEY_LENGTH, "signing public key");
  checkLength(payload.publicKeys.agreement, KEY_LENGTH, "agreement public key");
  checkLength(payload.secret, SECRET_LENGTH, "secret");
  return [
    VERSION_PREFIX,
    payload.invitationId,
    base64urlEncode(payload.publicKeys.signing),
    base64urlEncode(payload.publicKeys.agreement),
    base64urlEncode(payload.secret),
  ].join(".");
}

/** Throws on an unknown version, a wrong segment count or a wrong key or secret length. */
export function decodeInvitation(text: string): InvitationPayload {
  const parts = text.split(".");
  if (parts[0] !== VERSION_PREFIX) {
    throw new Error("Unsupported invitation version");
  }
  if (parts.length !== 5) {
    throw new Error("Invalid invitation format");
  }
  const [, invitationId, signing, agreement, secret] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];
  checkInvitationId(invitationId);
  const payload: InvitationPayload = {
    invitationId,
    publicKeys: {
      signing: base64urlDecode(signing),
      agreement: base64urlDecode(agreement),
    },
    secret: base64urlDecode(secret),
  };
  checkLength(payload.publicKeys.signing, KEY_LENGTH, "signing public key");
  checkLength(payload.publicKeys.agreement, KEY_LENGTH, "agreement public key");
  checkLength(payload.secret, SECRET_LENGTH, "secret");
  return payload;
}

/** The secret is never the cipher key: a subkey is derived with its own context. */
function deriveKey(sodium: Sodium, secret: Uint8Array): Uint8Array {
  checkLength(secret, SECRET_LENGTH, "secret");
  return sodium.kdfDeriveFromKey(
    KEY_LENGTH,
    KDF_SUBKEY_ID,
    KDF_CONTEXT,
    secret,
  );
}

/** Additional data: the protocol version byte followed by the invitation id. */
function additionalData(invitationId: string): Uint8Array {
  // The id is base64url, so every character is one ASCII byte.
  const id = Uint8Array.from(invitationId, (char) => char.charCodeAt(0));
  return Uint8Array.from([PROTOCOL_VERSION, ...id]);
}

export function encryptAcceptorKeys(
  sodium: Sodium,
  secret: Uint8Array,
  invitationId: string,
  keys: DevicePublicKeys,
): EncryptedAcceptorKeys {
  checkInvitationId(invitationId);
  checkLength(keys.signing, KEY_LENGTH, "signing public key");
  checkLength(keys.agreement, KEY_LENGTH, "agreement public key");
  const message = new Uint8Array(2 * KEY_LENGTH);
  message.set(keys.signing, 0);
  message.set(keys.agreement, KEY_LENGTH);
  const nonce = sodium.randomBytes(NONCE_LENGTH);
  const ciphertext = sodium.aeadEncrypt(
    message,
    additionalData(invitationId),
    nonce,
    deriveKey(sodium, secret),
  );
  return { nonce, ciphertext };
}

/** Throws when the ciphertext, nonce or invitation id was changed, or the secret is wrong. */
export function decryptAcceptorKeys(
  sodium: Sodium,
  secret: Uint8Array,
  invitationId: string,
  encrypted: EncryptedAcceptorKeys,
): DevicePublicKeys {
  checkInvitationId(invitationId);
  const message = sodium.aeadDecrypt(
    encrypted.ciphertext,
    additionalData(invitationId),
    encrypted.nonce,
    deriveKey(sodium, secret),
  );
  checkLength(message, 2 * KEY_LENGTH, "acceptor keys");
  return {
    signing: message.slice(0, KEY_LENGTH),
    agreement: message.slice(KEY_LENGTH),
  };
}
