import { DatabaseSync } from "node:sqlite";
import type { Envelope } from "@parapka/protocol";
import { migrate } from "./migrate.js";
import {
  text,
  toChallenge,
  toDevice,
  toInvitation,
  toMailbox,
  type Row,
} from "./sqlite-rows.js";
import type {
  AcceptResult,
  ChallengeRecord,
  DeviceRecord,
  InvitationRecord,
  MailboxRecord,
  PushToken,
  RelayStore,
  StoredDevice,
  StoredEnvelope,
} from "./store.js";

/** Store on `node:sqlite`; the schema comes from the numbered migrations. */
export class SqliteStore implements RelayStore {
  private readonly db: DatabaseSync;

  /** `location` is a file path or `:memory:`. */
  constructor(location: string) {
    this.db = new DatabaseSync(location);
    migrate(this.db);
  }

  close(): void {
    this.db.close();
  }

  private one(sql: string, ...params: string[]): Row | null {
    return this.db.prepare(sql).get(...params) ?? null;
  }

  private changed(sql: string, ...params: (string | number | null)[]): number {
    return Number(this.db.prepare(sql).run(...params).changes);
  }

  putDevice(device: DeviceRecord): Promise<void> {
    this.changed(
      "INSERT OR REPLACE INTO devices (device_id, signing_public_key, created_at_ms) VALUES (?, ?, ?)",
      device.deviceId,
      device.signingPublicKey,
      device.createdAtMs,
    );
    return Promise.resolve();
  }

  getDevice(deviceId: string): Promise<StoredDevice | null> {
    const row = this.one("SELECT * FROM devices WHERE device_id = ?", deviceId);
    return Promise.resolve(row === null ? null : toDevice(row));
  }

  setPushToken(deviceId: string, push: PushToken): Promise<boolean> {
    const n = this.changed(
      "UPDATE devices SET push_platform = ?, push_token = ? WHERE device_id = ?",
      push.platform,
      push.token,
      deviceId,
    );
    return Promise.resolve(n > 0);
  }

  deleteDevice(deviceId: string): Promise<boolean> {
    this.changed("DELETE FROM challenges WHERE device_id = ?", deviceId);
    this.changed("DELETE FROM invitations WHERE device_id = ?", deviceId);
    this.changed(
      "DELETE FROM envelopes WHERE json_extract(body, '$.senderDeviceId') = ?",
      deviceId,
    );
    const n = this.changed("DELETE FROM devices WHERE device_id = ?", deviceId);
    return Promise.resolve(n > 0);
  }

  putChallenge(challenge: ChallengeRecord): Promise<void> {
    this.changed(
      "INSERT OR REPLACE INTO challenges (challenge_id, device_id, nonce, expires_at_ms) VALUES (?, ?, ?, ?)",
      challenge.challengeId,
      challenge.deviceId,
      challenge.nonce,
      challenge.expiresAtMs,
    );
    return Promise.resolve();
  }

  takeChallenge(challengeId: string): Promise<ChallengeRecord | null> {
    const row = this.one(
      "SELECT * FROM challenges WHERE challenge_id = ?",
      challengeId,
    );
    this.changed("DELETE FROM challenges WHERE challenge_id = ?", challengeId);
    return Promise.resolve(row === null ? null : toChallenge(row));
  }

  putInvitation(invitation: InvitationRecord): Promise<void> {
    this.changed(
      "INSERT OR REPLACE INTO invitations (invitation_id, device_id, expires_at_ms, accepted_by_device_id, encrypted_keys_b) VALUES (?, ?, ?, ?, ?)",
      invitation.invitationId,
      invitation.deviceId,
      invitation.expiresAtMs,
      invitation.acceptedByDeviceId,
      invitation.encryptedKeysB,
    );
    return Promise.resolve();
  }

  getInvitation(invitationId: string): Promise<InvitationRecord | null> {
    const row = this.one(
      "SELECT * FROM invitations WHERE invitation_id = ?",
      invitationId,
    );
    return Promise.resolve(row === null ? null : toInvitation(row));
  }

  deleteInvitation(invitationId: string): Promise<boolean> {
    const n = this.changed(
      "DELETE FROM invitations WHERE invitation_id = ?",
      invitationId,
    );
    return Promise.resolve(n > 0);
  }

  acceptInvitation(
    invitationId: string,
    deviceId: string,
    encryptedKeysB: string,
    mailbox: MailboxRecord,
  ): Promise<AcceptResult> {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const open = this.one(
        "SELECT 1 AS ok FROM invitations WHERE invitation_id = ? AND accepted_by_device_id IS NULL",
        invitationId,
      );
      if (open === null) {
        this.db.exec("ROLLBACK");
        return Promise.resolve("used");
      }
      const paired = this.one(
        "SELECT 1 AS ok FROM mailboxes WHERE closed_at_ms IS NULL AND (device_id_a IN (?, ?) OR device_id_b IN (?, ?))",
        mailbox.deviceIdA,
        mailbox.deviceIdB,
        mailbox.deviceIdA,
        mailbox.deviceIdB,
      );
      if (paired !== null) {
        this.db.exec("ROLLBACK");
        return Promise.resolve("paired");
      }
      const n = this.changed(
        "UPDATE invitations SET accepted_by_device_id = ?, encrypted_keys_b = ? WHERE invitation_id = ? AND accepted_by_device_id IS NULL",
        deviceId,
        encryptedKeysB,
        invitationId,
      );
      if (n > 0) {
        this.changed(
          "INSERT INTO mailboxes (pair_mailbox_id, device_id_a, device_id_b, created_at_ms) VALUES (?, ?, ?, ?)",
          mailbox.pairMailboxId,
          mailbox.deviceIdA,
          mailbox.deviceIdB,
          mailbox.createdAtMs,
        );
      }
      this.db.exec("COMMIT");
      return Promise.resolve(n > 0 ? "accepted" : "used");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  purgeExpired(nowMs: number): Promise<void> {
    this.changed("DELETE FROM challenges WHERE expires_at_ms <= ?", nowMs);
    this.changed("DELETE FROM invitations WHERE expires_at_ms <= ?", nowMs);
    return Promise.resolve();
  }

  putMailbox(mailbox: MailboxRecord): Promise<void> {
    this.changed(
      "INSERT OR REPLACE INTO mailboxes (pair_mailbox_id, device_id_a, device_id_b, created_at_ms, closed_at_ms) VALUES (?, ?, ?, ?, ?)",
      mailbox.pairMailboxId,
      mailbox.deviceIdA,
      mailbox.deviceIdB,
      mailbox.createdAtMs,
      mailbox.closedAtMs ?? null,
    );
    return Promise.resolve();
  }

  getMailbox(pairMailboxId: string): Promise<MailboxRecord | null> {
    const row = this.one(
      "SELECT * FROM mailboxes WHERE pair_mailbox_id = ?",
      pairMailboxId,
    );
    return Promise.resolve(row === null ? null : toMailbox(row));
  }

  findMailboxByDevice(deviceId: string): Promise<MailboxRecord | null> {
    const row = this.one(
      "SELECT * FROM mailboxes WHERE closed_at_ms IS NULL AND (device_id_a = ? OR device_id_b = ?) LIMIT 1",
      deviceId,
      deviceId,
    );
    return Promise.resolve(row === null ? null : toMailbox(row));
  }

  deleteMailbox(pairMailboxId: string): Promise<boolean> {
    this.changed(
      "DELETE FROM envelopes WHERE pair_mailbox_id = ?",
      pairMailboxId,
    );
    const n = this.changed(
      "DELETE FROM mailboxes WHERE pair_mailbox_id = ?",
      pairMailboxId,
    );
    return Promise.resolve(n > 0);
  }

  closeMailbox(
    pairMailboxId: string,
    closedAtMs: number,
    closedByDeviceId: string,
  ): Promise<boolean> {
    const exists = this.one(
      "SELECT 1 AS ok FROM mailboxes WHERE pair_mailbox_id = ?",
      pairMailboxId,
    );
    if (exists === null) return Promise.resolve(false);
    this.changed(
      "DELETE FROM envelopes WHERE pair_mailbox_id = ? AND json_extract(body, '$.senderDeviceId') IS NOT ?",
      pairMailboxId,
      closedByDeviceId,
    );
    const n = this.changed(
      "UPDATE mailboxes SET closed_at_ms = COALESCE(closed_at_ms, ?) WHERE pair_mailbox_id = ?",
      closedAtMs,
      pairMailboxId,
    );
    return Promise.resolve(n > 0);
  }

  deleteClosedMailboxesBefore(cutoffMs: number): Promise<number> {
    const due = "SELECT pair_mailbox_id FROM mailboxes WHERE closed_at_ms <= ?";
    this.changed(
      `DELETE FROM envelopes WHERE pair_mailbox_id IN (${due})`,
      cutoffMs,
    );
    return Promise.resolve(
      this.changed("DELETE FROM mailboxes WHERE closed_at_ms <= ?", cutoffMs),
    );
  }

  addEnvelope(
    envelope: Envelope,
    receivedAtMs: number,
  ): Promise<{ readonly cursor: string; readonly accepted: boolean }> {
    const inserted = this.changed(
      "INSERT OR IGNORE INTO envelopes (envelope_id, pair_mailbox_id, body, received_at_ms) VALUES (?, ?, ?, ?)",
      envelope.envelopeId,
      envelope.pairMailboxId,
      JSON.stringify(envelope),
      receivedAtMs,
    );
    const row = this.one(
      "SELECT seq FROM envelopes WHERE envelope_id = ?",
      envelope.envelopeId,
    );
    return Promise.resolve({
      cursor: String(row?.["seq"]),
      accepted: inserted > 0,
    });
  }

  listEnvelopes(
    pairMailboxId: string,
    after: string | null,
    limit: number,
    excludeSenderDeviceId?: string,
  ): Promise<readonly StoredEnvelope[]> {
    const sql = `SELECT seq, body FROM envelopes WHERE pair_mailbox_id = ? AND seq > ? AND json_extract(body, '$.senderDeviceId') IS NOT ? ORDER BY seq LIMIT ?`;
    const args = [pairMailboxId, Number(after ?? 0)];
    const rows = this.db
      .prepare(sql)
      .all(...args, excludeSenderDeviceId ?? null, limit);
    return Promise.resolve(
      rows.map((row) => ({
        cursor: String(row["seq"]),
        envelope: JSON.parse(text(row, "body")) as Envelope,
      })),
    );
  }

  deleteEnvelopes(
    pairMailboxId: string,
    envelopeIds: readonly string[],
    excludeSenderDeviceId?: string,
  ): Promise<number> {
    const sql = `DELETE FROM envelopes WHERE envelope_id = ? AND pair_mailbox_id = ? AND json_extract(body, '$.senderDeviceId') IS NOT ?`;
    const args = [pairMailboxId, excludeSenderDeviceId ?? null] as const;
    let deleted = 0;
    for (const id of envelopeIds) deleted += this.changed(sql, id, ...args);
    return Promise.resolve(deleted);
  }

  deleteEnvelopesReceivedBefore(cutoffMs: number): Promise<number> {
    return Promise.resolve(
      this.changed("DELETE FROM envelopes WHERE received_at_ms <= ?", cutoffMs),
    );
  }
}
