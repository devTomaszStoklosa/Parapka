import { base64urlEncode, type Sodium } from "@parapka/crypto";
import {
  buildSignedText,
  type AcceptInvitationRequest,
  type AcceptInvitationResponse,
  type AckRequest,
  type AckResponse,
  type CreateInvitationRequest,
  type CreateInvitationResponse,
  type Envelope,
  type FetchEnvelopesResponse,
  type FetchInvitationKeysResponse,
  type RegisterDeviceRequest,
  type RegisterDeviceResponse,
  type SendEnvelopeRequest,
  type SendEnvelopeResponse,
  type SetPushTokenRequest,
} from "@parapka/protocol";
import type { Sha256 } from "../platform/sha256";
import { kindOfStatus, RelayError } from "./relay-error";

/** The part of `fetch` the client uses; the app injects the real one. */
export type RelayFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ status: number; text(): Promise<string> }>;

/** The device that signs the requests: its id and Ed25519 private key. */
export interface DeviceCredentials {
  readonly deviceId: string;
  readonly signingPrivateKey: Uint8Array;
}

export interface RelayClientOptions {
  readonly baseUrl: string;
  readonly fetch: RelayFetch;
  readonly sodium: Sodium;
  readonly sha256: Sha256;
  /** Without credentials only `registerDevice` works. */
  readonly credentials?: DeviceCredentials;
}

interface ChallengeResponse {
  readonly challengeId: string;
  readonly nonce: string;
}

interface Call {
  readonly method: string;
  /** Path with the query, as the relay sees it. */
  readonly path: string;
  readonly body?: unknown;
  readonly signed: boolean;
}

export interface RelayClient {
  registerDevice(signingPublicKey: string): Promise<RegisterDeviceResponse>;
  setPushToken(request: SetPushTokenRequest): Promise<void>;
  deleteDevice(): Promise<void>;
  createInvitation(): Promise<CreateInvitationResponse>;
  acceptInvitation(
    invitationId: string,
    encryptedKeys: string,
  ): Promise<AcceptInvitationResponse>;
  fetchInvitationKeys(
    invitationId: string,
  ): Promise<FetchInvitationKeysResponse>;
  sendEnvelope(
    pairId: string,
    envelope: Envelope,
  ): Promise<SendEnvelopeResponse>;
  fetchEnvelopes(
    pairId: string,
    after: string | null,
  ): Promise<FetchEnvelopesResponse>;
  ack(pairId: string, envelopeIds: readonly string[]): Promise<AckResponse>;
  closePair(pairId: string): Promise<void>;
  /** The WebSocket URL of the pair with the credentials in the query (#101). */
  webSocketUrl(pairId: string): Promise<string>;
}

const encoder = new TextEncoder();
const id = encodeURIComponent;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

interface Init {
  method: string;
  headers: Record<string, string>;
  body?: string;
}

async function send(
  options: RelayClientOptions,
  url: string,
  init: Init,
): Promise<{ status: number; text: string }> {
  try {
    const response = await options.fetch(url, init);
    return { status: response.status, text: await response.text() };
  } catch {
    throw new RelayError("network");
  }
}

function parse(status: number, text: string): unknown {
  if (text === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new RelayError("server", status);
  }
}

function requireCredentials(options: RelayClientOptions): DeviceCredentials {
  if (options.credentials === undefined) throw new RelayError("unauthorized");
  return options.credentials;
}

async function fetchChallenge(
  options: RelayClientOptions,
  base: string,
  deviceId: string,
): Promise<ChallengeResponse> {
  const response = await send(
    options,
    `${base}/v1/devices/${id(deviceId)}/challenges`,
    { method: "POST", headers: {} },
  );
  if (response.status !== 201) {
    throw new RelayError(kindOfStatus(response.status), response.status);
  }
  return parse(response.status, response.text) as ChallengeResponse;
}

interface SignedCredentials {
  readonly deviceId: string;
  readonly challengeId: string;
  readonly signature: string;
}

/** Fetches a challenge and signs `method`, `path` and `body` with it. */
async function sign(
  options: RelayClientOptions,
  base: string,
  call: { method: string; path: string; body: Uint8Array },
): Promise<SignedCredentials> {
  const { deviceId, signingPrivateKey } = requireCredentials(options);
  const { challengeId, nonce } = await fetchChallenge(options, base, deviceId);
  const text = buildSignedText({
    method: call.method,
    url: call.path,
    challengeId,
    nonce,
    bodyHashHex: hex(await options.sha256(call.body)),
  });
  const signature = base64urlEncode(
    options.sodium.sign(encoder.encode(text), signingPrivateKey),
  );
  return { deviceId, challengeId, signature };
}

async function perform(
  options: RelayClientOptions,
  base: string,
  request: Call,
): Promise<unknown> {
  const headers: Record<string, string> = {};
  const body =
    request.body === undefined ? undefined : JSON.stringify(request.body);
  if (body !== undefined) headers["content-type"] = "application/json";
  if (request.signed) {
    const credentials = await sign(options, base, {
      method: request.method,
      path: request.path,
      body: encoder.encode(body ?? ""),
    });
    headers["X-Device-Id"] = credentials.deviceId;
    headers["X-Challenge-Id"] = credentials.challengeId;
    headers["X-Signature"] = credentials.signature;
  }
  const response = await send(options, `${base}${request.path}`, {
    method: request.method,
    headers,
    ...(body === undefined ? {} : { body }),
  });
  if (response.status < 200 || response.status >= 300) {
    throw new RelayError(kindOfStatus(response.status), response.status);
  }
  return parse(response.status, response.text);
}

function webSocketUrl(
  options: RelayClientOptions,
  base: string,
  pairId: string,
): Promise<string> {
  const path = `/v1/pairs/${id(pairId)}/ws`;
  return sign(options, base, {
    method: "GET",
    path,
    body: new Uint8Array(),
  }).then(
    (c) =>
      `${base.replace(/^http/, "ws")}${path}?deviceId=${id(c.deviceId)}` +
      `&challengeId=${id(c.challengeId)}&signature=${id(c.signature)}`,
  );
}

function pairMethods(
  base: string,
  options: RelayClientOptions,
): Pick<
  RelayClient,
  "sendEnvelope" | "fetchEnvelopes" | "ack" | "closePair" | "webSocketUrl"
> {
  const signed = (method: string, path: string, body?: unknown) =>
    perform(options, base, { method, path, body, signed: true });
  return {
    sendEnvelope: async (pairId, envelope) =>
      (await signed("POST", `/v1/pairs/${id(pairId)}/envelopes`, {
        envelope,
      } satisfies SendEnvelopeRequest)) as SendEnvelopeResponse,
    fetchEnvelopes: async (pairId, after) =>
      (await signed(
        "GET",
        `/v1/pairs/${id(pairId)}/envelopes` +
          (after === null ? "" : `?after=${id(after)}`),
      )) as FetchEnvelopesResponse,
    ack: async (pairId, envelopeIds) =>
      (await signed("POST", `/v1/pairs/${id(pairId)}/acks`, {
        envelopeIds,
      } satisfies AckRequest)) as AckResponse,
    closePair: async (pairId) => {
      await signed("DELETE", `/v1/pairs/${id(pairId)}`);
    },
    webSocketUrl: (pairId) => webSocketUrl(options, base, pairId),
  };
}

/** The relay client: signs every authenticated request with a fresh challenge (spec 7.4). */
export function createRelayClient(options: RelayClientOptions): RelayClient {
  const base = options.baseUrl.replace(/\/+$/, "");
  const signed = (method: string, path: string, body?: unknown) =>
    perform(options, base, { method, path, body, signed: true });
  const ownPath = () =>
    `/v1/devices/${id(requireCredentials(options).deviceId)}`;
  return {
    ...pairMethods(base, options),
    registerDevice: async (signingPublicKey) =>
      (await perform(options, base, {
        method: "POST",
        path: "/v1/devices",
        body: { signingPublicKey } satisfies RegisterDeviceRequest,
        signed: false,
      })) as RegisterDeviceResponse,
    setPushToken: async (request) => {
      await signed("PUT", `${ownPath()}/push-token`, request);
    },
    deleteDevice: async () => {
      await signed("DELETE", ownPath());
    },
    createInvitation: async () =>
      (await signed("POST", "/v1/invitations", {
        deviceId: requireCredentials(options).deviceId,
      } satisfies CreateInvitationRequest)) as CreateInvitationResponse,
    acceptInvitation: async (invitationId, encryptedKeys) =>
      (await signed("POST", `/v1/invitations/${id(invitationId)}/accept`, {
        encryptedKeys,
      } satisfies AcceptInvitationRequest)) as AcceptInvitationResponse,
    fetchInvitationKeys: async (invitationId) =>
      (await signed(
        "GET",
        `/v1/invitations/${id(invitationId)}/keys`,
      )) as FetchInvitationKeysResponse,
  };
}
