import type { Envelope } from "./envelope.js";

/** Endpoints of the relay (spec 7.4, draft). */
export const RELAY_ROUTES = {
  registerDevice: { method: "POST", path: "/v1/devices" },
  setPushToken: { method: "PUT", path: "/v1/devices/{id}/push-token" },
  deleteDevice: { method: "DELETE", path: "/v1/devices/{id}" },
  createInvitation: { method: "POST", path: "/v1/invitations" },
  acceptInvitation: { method: "POST", path: "/v1/invitations/{id}/accept" },
  sendEnvelope: { method: "POST", path: "/v1/pairs/{id}/envelopes" },
  fetchEnvelopes: {
    method: "GET",
    path: "/v1/pairs/{id}/envelopes?after={cursor}",
  },
  acknowledge: { method: "POST", path: "/v1/pairs/{id}/acks" },
  closePair: { method: "DELETE", path: "/v1/pairs/{id}" },
} as const;

export interface RegisterDeviceRequest {
  /** Public signing key (Ed25519), base64. */
  readonly signingPublicKey: string;
}
export interface RegisterDeviceResponse {
  readonly deviceId: string;
}

export interface SetPushTokenRequest {
  /** APNs or FCM token. */
  readonly pushToken: string;
}

export interface CreateInvitationRequest {
  readonly deviceId: string;
}
export interface CreateInvitationResponse {
  readonly invitationId: string;
  /** ISO 8601 time. */
  readonly expiresAt: string;
}

export interface AcceptInvitationRequest {
  readonly deviceId: string;
}
export interface AcceptInvitationResponse {
  readonly pairId: string;
  readonly pairMailboxId: string;
}

export interface SendEnvelopeRequest {
  readonly envelope: Envelope;
}
export interface SendEnvelopeResponse {
  readonly envelopeId: string;
  readonly cursor: string;
}

export interface FetchEnvelopesQuery {
  /** Return only envelopes after this cursor. */
  readonly after?: string;
}
export interface FetchedEnvelope {
  readonly cursor: string;
  readonly envelope: Envelope;
}
export interface FetchEnvelopesResponse {
  readonly envelopes: readonly FetchedEnvelope[];
}

export interface AcknowledgeRequest {
  readonly envelopeIds: readonly string[];
}

/** Error body of every endpoint. */
export interface RelayErrorResponse {
  readonly error: string;
  readonly message?: string;
}
