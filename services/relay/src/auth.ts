import {
  createHash,
  createPublicKey,
  verify,
  type KeyObject,
} from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

/** A challenge is valid for 5 minutes. */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Starts every signed text, so a request signature cannot be mistaken for another signature of the same key. */
export const AUTH_CONTEXT_PREFIX = "parapka-relay-auth-v1\n";

// DER prefix of an Ed25519 SubjectPublicKeyInfo; the 32 key bytes follow.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const ED25519_KEY_LENGTH = 32;

export interface SignedRequestParts {
  readonly method: string;
  readonly url: string;
  readonly challengeId: string;
  readonly nonce: string;
  readonly body: Uint8Array;
}

/** The text a device signs: prefix, method, path, challenge and body hash. */
export function buildSignedText(parts: SignedRequestParts): string {
  const bodyHash = createHash("sha256").update(parts.body).digest("hex");
  return (
    AUTH_CONTEXT_PREFIX +
    [parts.method, parts.url, parts.challengeId, parts.nonce, bodyHash].join(
      "\n",
    )
  );
}

/** Imports a base64 Ed25519 public key (32 bytes); null when it is malformed. */
export function importPublicKey(base64: string): KeyObject | null {
  const raw = Buffer.from(base64, "base64");
  if (raw.length !== ED25519_KEY_LENGTH || raw.toString("base64") !== base64) {
    return null;
  }
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
    format: "der",
    type: "spki",
  });
}

/** Verifies the base64 signature over the text with the base64 public key. */
export function verifySignature(
  publicKeyBase64: string,
  text: string,
  signatureBase64: string,
): boolean {
  const key = importPublicKey(publicKeyBase64);
  if (key === null) return false;
  return verify(
    null,
    Buffer.from(text, "utf8"),
    key,
    Buffer.from(signatureBase64, "base64"),
  );
}

function header(request: FastifyRequest, name: string): string | null {
  const value = request.headers[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** The id of the device whose signature the request carries; null otherwise. */
async function verifiedDeviceId(
  request: FastifyRequest,
): Promise<string | null> {
  const { store, clock } = request.server.relay;
  const deviceId = header(request, "x-device-id");
  const challengeId = header(request, "x-challenge-id");
  const signature = header(request, "x-signature");
  if (deviceId === null || challengeId === null || signature === null) {
    return null;
  }
  // The challenge is consumed even when the check below fails.
  const challenge = await store.takeChallenge(challengeId);
  if (
    challenge === null ||
    challenge.deviceId !== deviceId ||
    challenge.expiresAtMs <= clock.nowMs()
  ) {
    return null;
  }
  const device = await store.getDevice(deviceId);
  if (device === null) return null;
  const text = buildSignedText({
    method: request.method,
    url: request.url,
    challengeId,
    nonce: challenge.nonce,
    body: request.rawBody ?? new Uint8Array(),
  });
  return verifySignature(device.signingPublicKey, text, signature)
    ? deviceId
    : null;
}

/**
 * Pre-handler: authenticates the device by the signature over a server
 * challenge and sets `request.deviceId`; every failure is a uniform 401.
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | undefined> {
  const deviceId = await verifiedDeviceId(request);
  if (deviceId === null) {
    return reply.code(401).send({ error: "unauthorized" });
  }
  request.deviceId = deviceId;
  return undefined;
}

declare module "fastify" {
  interface FastifyRequest {
    /** Raw bytes of a JSON body, kept for the signature check. */
    rawBody: Buffer | null;
    /** Set by `authenticate`. */
    deviceId: string | null;
  }
}
