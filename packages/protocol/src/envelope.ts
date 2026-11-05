import { MAX_ENVELOPE_BYTES } from "./limits.js";
import {
  type PlainObject,
  type Scope,
  type ValidationError,
  type ValidationResult,
  copyFields,
  isBase64,
  isNonEmptyString,
  isPlainObject,
  requireField,
  utf8ByteLength,
} from "./validation.js";

/** Envelope with the fields visible to the relay (spec 7.4). */
export interface Envelope {
  readonly envelopeId: string;
  readonly pairMailboxId: string;
  readonly senderDeviceId: string;
  readonly protocolVersion: number;
  /** Base64. */
  readonly nonce: string;
  /** Base64. */
  readonly ciphertext: string;
  /** Fields unknown to this version are kept as they are. */
  readonly [unknown: string]: unknown;
}

const isVersion = (value: unknown): boolean =>
  typeof value === "number" && Number.isInteger(value) && value >= 1;

export function validateEnvelope(input: unknown): ValidationResult<Envelope> {
  if (!isPlainObject(input)) {
    return {
      ok: false,
      errors: [{ field: "envelope", message: "must be an object" }],
    };
  }
  const errors: ValidationError[] = [];
  const scope: Scope = { source: input, prefix: "", errors };
  for (const name of ["envelopeId", "pairMailboxId", "senderDeviceId"]) {
    requireField(scope, name, isNonEmptyString, "a non-empty string");
  }
  requireField(scope, "protocolVersion", isVersion, "a positive integer");
  for (const name of ["nonce", "ciphertext"]) {
    requireField(scope, name, isBase64, "a non-empty base64 string");
  }
  if (errors.length > 0) return { ok: false, errors };
  const copy: PlainObject = copyFields(input);
  const size = utf8ByteLength(JSON.stringify(copy));
  if (size > MAX_ENVELOPE_BYTES) {
    const message = `must be at most ${String(MAX_ENVELOPE_BYTES)} bytes, got ${String(size)}`;
    return { ok: false, errors: [{ field: "envelope", message }] };
  }
  return { ok: true, value: copy as unknown as Envelope };
}
