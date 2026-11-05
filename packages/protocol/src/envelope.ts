import { MAX_ENVELOPE_BYTES } from "./limits.js";
import {
  ErrorList,
  type ValidationResult,
  copyOwn,
  isPlainObject,
  utf8Length,
} from "./validation.js";

/**
 * Plain fields of an envelope, visible to the relay (spec 7.4). A validated
 * envelope may carry more fields from a newer version; they are kept as is.
 */
export interface Envelope {
  readonly envelopeId: string;
  readonly pairMailboxId: string;
  readonly senderDeviceId: string;
  readonly protocolVersion: number;
  readonly nonce: string;
  readonly ciphertext: string;
}

export function validateEnvelope(input: unknown): ValidationResult<Envelope> {
  if (!isPlainObject(input)) {
    return {
      ok: false,
      errors: [{ field: "envelope", message: "must be an object" }],
    };
  }
  const errors = new ErrorList();
  errors.text(input, "envelopeId");
  errors.text(input, "pairMailboxId");
  errors.text(input, "senderDeviceId");
  errors.positiveInteger(input, "protocolVersion");
  errors.base64(input, "nonce");
  errors.base64(input, "ciphertext");
  if (errors.errors.length === 0) {
    const size = utf8Length(JSON.stringify(input));
    if (size > MAX_ENVELOPE_BYTES) {
      errors.add(
        "envelope",
        `is ${String(size)} bytes, the limit is ${String(MAX_ENVELOPE_BYTES)}`,
      );
    }
  }
  if (errors.errors.length > 0) return { ok: false, errors: errors.errors };
  return { ok: true, value: copyOwn(input) as unknown as Envelope };
}
