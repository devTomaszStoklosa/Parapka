import type { Envelope } from "./envelope.js";

// Request and response bodies of the relay endpoints (spec 7.4, draft).

/** POST /v1/devices */
export interface RegisterDeviceRequest {
  /** Ed25519 public key used to sign requests, base64. */
  readonly signingPublicKey: string;
}
export interface RegisterDeviceResponse {
  readonly deviceId: string;
}

/** PUT /v1/devices/{id}/push-token */
export interface SetPushTokenRequest {
  readonly platform: "apns" | "fcm";
  readonly pushToken: string;
}
export type SetPushTokenResponse = Record<string, never>;

/** DELETE /v1/devices/{id}: no request body. */
export type DeleteDeviceResponse = Record<string, never>;

/** POST /v1/invitations */
export interface CreateInvitationRequest {
  readonly deviceId: string;
}
export interface CreateInvitationResponse {
  readonly invitationId: string;
  readonly expiresAt: string;
}

/** POST /v1/invitations/{id}/accept */
export interface AcceptInvitationRequest {
  /** Keys of device B sealed for device A; the relay does not read them. */
  readonly encryptedKeys: string;
}
export interface AcceptInvitationResponse {
  readonly pairId: string;
  readonly pairMailboxId: string;
}

/** GET /v1/invitations/{id}/keys: no request body. */
export interface FetchInvitationKeysResponse {
  readonly encryptedKeys: string;
  readonly acceptedByDeviceId: string;
}

/** POST /v1/pairs/{id}/envelopes */
export interface SendEnvelopeRequest {
  readonly envelope: Envelope;
}
export interface SendEnvelopeResponse {
  readonly envelopeId: string;
  /** False when the relay already had this `envelopeId`. */
  readonly accepted: boolean;
}

/** GET /v1/pairs/{id}/envelopes?after={cursor} */
export interface FetchEnvelopesQuery {
  readonly after?: string;
}
export interface FetchEnvelopesResponse {
  readonly envelopes: readonly {
    readonly cursor: string;
    readonly envelope: Envelope;
  }[];
  /** Cursor to pass as `after` next time. */
  readonly nextCursor: string | null;
}

/** POST /v1/pairs/{id}/acks */
export interface AckRequest {
  readonly envelopeIds: readonly string[];
}
export interface AckResponse {
  /** Number of envelopes the relay deleted. */
  readonly deleted: number;
}

/** DELETE /v1/pairs/{id}: no request body. */
export type ClosePairResponse = Record<string, never>;

/** Error body of every endpoint. */
export interface ErrorResponse {
  readonly error: string;
  readonly message?: string;
}
