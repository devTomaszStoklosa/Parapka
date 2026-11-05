import type { SQLOutputValue } from "node:sqlite";
import type {
  ChallengeRecord,
  InvitationRecord,
  MailboxRecord,
  PushToken,
  StoredDevice,
} from "./store.js";

export type Row = Record<string, SQLOutputValue>;

export function text(row: Row, column: string): string {
  return String(row[column]);
}

function num(row: Row, column: string): number {
  return Number(row[column]);
}

export function toDevice(row: Row): StoredDevice {
  const platform = row["push_platform"];
  const token = row["push_token"];
  return {
    deviceId: text(row, "device_id"),
    signingPublicKey: text(row, "signing_public_key"),
    createdAtMs: num(row, "created_at_ms"),
    push:
      platform === null || token === null
        ? null
        : {
            platform: text(row, "push_platform") as PushToken["platform"],
            token: text(row, "push_token"),
          },
  };
}

export function toChallenge(row: Row): ChallengeRecord {
  return {
    challengeId: text(row, "challenge_id"),
    deviceId: text(row, "device_id"),
    nonce: text(row, "nonce"),
    expiresAtMs: num(row, "expires_at_ms"),
  };
}

export function toInvitation(row: Row): InvitationRecord {
  return {
    invitationId: text(row, "invitation_id"),
    deviceId: text(row, "device_id"),
    expiresAtMs: num(row, "expires_at_ms"),
    acceptedByDeviceId:
      row["accepted_by_device_id"] === null
        ? null
        : text(row, "accepted_by_device_id"),
    encryptedKeysB:
      row["encrypted_keys_b"] === null ? null : text(row, "encrypted_keys_b"),
  };
}

export function toMailbox(row: Row): MailboxRecord {
  const mailbox = {
    pairMailboxId: text(row, "pair_mailbox_id"),
    deviceIdA: text(row, "device_id_a"),
    deviceIdB: text(row, "device_id_b"),
    createdAtMs: num(row, "created_at_ms"),
  };
  return row["closed_at_ms"] === null || row["closed_at_ms"] === undefined
    ? mailbox
    : { ...mailbox, closedAtMs: num(row, "closed_at_ms") };
}
