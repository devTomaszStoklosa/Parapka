import type { Envelope } from "@parapka/protocol";

// Records hold identifiers, keys and tokens only: no names, e-mails or phone
// numbers (NFR-PRV-03).

export interface DeviceRecord {
  readonly deviceId: string;
  /** Ed25519 public key, base64. */
  readonly signingPublicKey: string;
  readonly createdAtMs: number;
}

export interface PushToken {
  readonly platform: "apns" | "fcm";
  readonly token: string;
}

export interface StoredDevice extends DeviceRecord {
  readonly push: PushToken | null;
}

export interface ChallengeRecord {
  readonly challengeId: string;
  readonly deviceId: string;
  readonly nonce: string;
  readonly expiresAtMs: number;
}

export interface InvitationRecord {
  readonly invitationId: string;
  readonly deviceId: string;
  readonly expiresAtMs: number;
  /** Device B that accepted the invitation; null while it is unused. */
  readonly acceptedByDeviceId: string | null;
  /** Opaque ciphertext of the keys of B; the relay does not read it. */
  readonly encryptedKeysB: string | null;
}

export interface MailboxRecord {
  readonly pairMailboxId: string;
  readonly deviceIdA: string;
  readonly deviceIdB: string;
  readonly createdAtMs: number;
  /** When the mailbox was closed; absent while it is open. */
  readonly closedAtMs?: number;
}

export interface StoredEnvelope {
  /** Increasing decimal string; envelopes are listed in cursor order. */
  readonly cursor: string;
  readonly envelope: Envelope;
}

/** Storage of the relay, replaceable behind this interface. */
/** The outcome of `RelayStore.acceptInvitation`. */
export type AcceptResult = "accepted" | "used" | "paired";

export interface RelayStore {
  putDevice(device: DeviceRecord): Promise<void>;
  getDevice(deviceId: string): Promise<StoredDevice | null>;
  /** Returns false when the device does not exist. */
  setPushToken(deviceId: string, push: PushToken): Promise<boolean>;
  /**
   * Deletes the device with its push token, challenges, invitations and the
   * envelopes it sent. Returns false when the device does not exist.
   */
  deleteDevice(deviceId: string): Promise<boolean>;

  putChallenge(challenge: ChallengeRecord): Promise<void>;
  /** Returns the challenge and deletes it, so it can be used once. */
  takeChallenge(challengeId: string): Promise<ChallengeRecord | null>;

  putInvitation(invitation: InvitationRecord): Promise<void>;
  getInvitation(invitationId: string): Promise<InvitationRecord | null>;
  deleteInvitation(invitationId: string): Promise<boolean>;
  /**
   * Marks the invitation as accepted by `deviceId`, stores the ciphertext and
   * creates the mailbox, all or nothing. Changes nothing and returns "used"
   * when the invitation does not exist or was already accepted, or "paired"
   * when either device already has a mailbox.
   */
  acceptInvitation(
    invitationId: string,
    deviceId: string,
    encryptedKeysB: string,
    mailbox: MailboxRecord,
  ): Promise<AcceptResult>;

  /** Deletes challenges and invitations that expired at or before `nowMs`. */
  purgeExpired(nowMs: number): Promise<void>;

  putMailbox(mailbox: MailboxRecord): Promise<void>;
  getMailbox(pairMailboxId: string): Promise<MailboxRecord | null>;
  /** The mailbox in which the device is A or B. */
  findMailboxByDevice(deviceId: string): Promise<MailboxRecord | null>;
  /** Deletes the mailbox with its envelopes. */
  deleteMailbox(pairMailboxId: string): Promise<boolean>;

  /**
   * Marks the mailbox as closed at `closedAtMs`; an earlier closing time is
   * kept. Returns false when the mailbox does not exist.
   */
  closeMailbox(pairMailboxId: string, closedAtMs: number): Promise<boolean>;
  /** Deletes the mailboxes closed at or before `cutoffMs` with their envelopes. */
  deleteClosedMailboxesBefore(cutoffMs: number): Promise<number>;

  /** Stores the envelope; `accepted` is false when its id is already there. */
  addEnvelope(
    envelope: Envelope,
    receivedAtMs: number,
  ): Promise<{ readonly cursor: string; readonly accepted: boolean }>;
  /**
   * Envelopes of the mailbox after the cursor, at most `limit`; those sent by
   * `excludeSenderDeviceId` are skipped before the limit applies.
   */
  listEnvelopes(
    pairMailboxId: string,
    after: string | null,
    limit: number,
    excludeSenderDeviceId?: string,
  ): Promise<readonly StoredEnvelope[]>;
  /**
   * Deletes the envelopes of the mailbox, except those sent by
   * `excludeSenderDeviceId`; returns how many were deleted.
   */
  deleteEnvelopes(
    pairMailboxId: string,
    envelopeIds: readonly string[],
    excludeSenderDeviceId?: string,
  ): Promise<number>;
  /** Deletes the envelopes received at or before `cutoffMs`; returns how many. */
  deleteEnvelopesReceivedBefore(cutoffMs: number): Promise<number>;
}
