import {
  createHash,
  createPublicKey,
  verify,
  type KeyObject,
} from "node:crypto";
import {
  AUTH_CONTEXT_PREFIX,
  buildSignedText as buildSignedTextFromHash,
} from "@parapka/protocol";
import type { FastifyReply, FastifyRequest } from "fastify";

/** A challenge is valid for 5 minutes. */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export { AUTH_CONTEXT_PREFIX };

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
  return buildSignedTextFromHash({
    method: parts.method,
    url: parts.url,
    challengeId: parts.challengeId,
    nonce: parts.nonce,
    bodyHashHex: createHash("sha256").update(parts.body).digest("hex"),
  });
}

const ED25519_SIGNATURE_LENGTH = 64;

/** Decodes canonical unpadded base64url of the given length; null otherwise. */
function decodeBase64Url(text: string, length: number): Buffer | null {
  const raw = Buffer.from(text, "base64url");
  if (raw.length !== length || raw.toString("base64url") !== text) return null;
  return raw;
}

/** Imports a base64url Ed25519 public key (32 bytes); null when it is malformed. */
export function importPublicKey(base64url: string): KeyObject | null {
  const raw = decodeBase64Url(base64url, ED25519_KEY_LENGTH);
  if (raw === null) return null;
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
    format: "der",
    type: "spki",
  });
}

/** Verifies the base64url signature over the text with the base64url public key. */
export function verifySignature(
  publicKeyBase64Url: string,
  text: string,
  signatureBase64Url: string,
): boolean {
  const key = importPublicKey(publicKeyBase64Url);
  if (key === null) return false;
  const signature = decodeBase64Url(
    signatureBase64Url,
    ED25519_SIGNATURE_LENGTH,
  );
  if (signature === null) return false;
  return verify(null, Buffer.from(text, "utf8"), key, signature);
}

function header(request: FastifyRequest, name: string): string | null {
  const value = request.headers[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

interface Credentials {
  readonly deviceId: string;
  readonly challengeId: string;
  readonly signature: string;
  /** The URL that was signed. */
  readonly url: string;
}

const QUERY_CREDENTIALS: readonly string[] = [
  "deviceId",
  "challengeId",
  "signature",
];

/** The URL without the three credential parameters; its `?` goes too when nothing remains. */
function urlWithoutCredentials(url: string): string {
  const mark = url.indexOf("?");
  if (mark === -1) return url;
  const kept = url
    .slice(mark + 1)
    .split("&")
    .filter((part) => !QUERY_CREDENTIALS.includes(part.split("=")[0] ?? ""));
  const path = url.slice(0, mark);
  return kept.length === 0 ? path : `${path}?${kept.join("&")}`;
}

function queryValue(
  query: Record<string, unknown>,
  name: string,
): string | null {
  const value = query[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Reads the credentials from the headers. A WebSocket upgrade, whose browser
 * API cannot set headers, may carry them in the query instead.
 */
function credentialsOf(request: FastifyRequest): Credentials | null {
  const deviceId = header(request, "x-device-id");
  const challengeId = header(request, "x-challenge-id");
  const signature = header(request, "x-signature");
  if (deviceId !== null && challengeId !== null && signature !== null) {
    return { deviceId, challengeId, signature, url: request.url };
  }
  if (request.headers.upgrade?.toLowerCase() !== "websocket") return null;
  const query = request.query as Record<string, unknown>;
  const fromQuery = {
    deviceId: queryValue(query, "deviceId"),
    challengeId: queryValue(query, "challengeId"),
    signature: queryValue(query, "signature"),
  };
  if (
    fromQuery.deviceId === null ||
    fromQuery.challengeId === null ||
    fromQuery.signature === null
  ) {
    return null;
  }
  return {
    deviceId: fromQuery.deviceId,
    challengeId: fromQuery.challengeId,
    signature: fromQuery.signature,
    url: urlWithoutCredentials(request.url),
  };
}

/** The id of the device whose signature the request carries; null otherwise. */
async function verifiedDeviceId(
  request: FastifyRequest,
): Promise<string | null> {
  const { store, clock } = request.server.relay;
  const credentials = credentialsOf(request);
  if (credentials === null) return null;
  const { deviceId, challengeId, signature } = credentials;
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
    url: credentials.url,
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
