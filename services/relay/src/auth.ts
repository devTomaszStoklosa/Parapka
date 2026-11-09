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

const WEBSOCKET_ROUTE = "/v1/pairs/:id/ws";
const QUERY_AUTH_PARAMS = ["deviceId", "challengeId", "signature"];

interface Credentials {
  readonly deviceId: string | null;
  readonly challengeId: string | null;
  readonly signature: string | null;
  /** The URL the device signed. */
  readonly url: string;
}

function fromHeaders(request: FastifyRequest): Credentials {
  return {
    deviceId: header(request, "x-device-id"),
    challengeId: header(request, "x-challenge-id"),
    signature: header(request, "x-signature"),
    url: request.url,
  };
}

/**
 * Credentials of a browser WebSocket, which cannot set headers: they are
 * query parameters, and the signed URL is the path with the remaining query.
 */
function fromQuery(request: FastifyRequest): Credentials {
  const [path = "", query = ""] = request.url.split("?", 2);
  const found = new Map<string, string>();
  const kept: string[] = [];
  for (const pair of query.split("&")) {
    const key = decodeParam(pair.split("=", 1)[0] ?? "");
    if (!QUERY_AUTH_PARAMS.includes(key)) {
      if (pair.length > 0) kept.push(pair);
    } else if (!found.has(key)) {
      found.set(key, decodeParam(pair.slice(key.length + 1)));
    }
  }
  const value = (key: string): string | null => {
    const text = found.get(key);
    return text === undefined || text.length === 0 ? null : text;
  };
  return {
    deviceId: value("deviceId"),
    challengeId: value("challengeId"),
    signature: value("signature"),
    url: kept.length === 0 ? path : `${path}?${kept.join("&")}`,
  };
}

function decodeParam(text: string): string {
  try {
    return decodeURIComponent(text.replaceAll("+", " "));
  } catch {
    return text;
  }
}

/** The id of the device whose signature the request carries; null otherwise. */
async function verifiedDeviceId(
  request: FastifyRequest,
  credentials: Credentials,
): Promise<string | null> {
  const { store, clock } = request.server.relay;
  const { deviceId, challengeId, signature, url } = credentials;
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
    url,
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
 * A browser WebSocket cannot set headers, so the WebSocket route without
 * the auth headers takes `deviceId`, `challengeId` and `signature` from the
 * query; no other route does.
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | undefined> {
  const fromHeader = fromHeaders(request);
  const credentials =
    request.routeOptions.url === WEBSOCKET_ROUTE &&
    fromHeader.deviceId === null &&
    fromHeader.challengeId === null &&
    fromHeader.signature === null
      ? fromQuery(request)
      : fromHeader;
  return finish(request, reply, credentials);
}

async function finish(
  request: FastifyRequest,
  reply: FastifyReply,
  credentials: Credentials,
): Promise<FastifyReply | undefined> {
  const deviceId = await verifiedDeviceId(request, credentials);
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
