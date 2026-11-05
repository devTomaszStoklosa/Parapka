import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import type { Envelope } from "@parapka/protocol";
import { migrate } from "./migrate.js";
import type {
  ChallengeRecord,
  DeviceRecord,
  InvitationRecord,
  MailboxRecord,
  PushToken,
  RelayStore,
  StoredDevice,
  StoredEnvelope,
} from "./store.js";

type Row = Record<string, SQLOutputValue>;

function text(row: Row, column: string): string {
  return String(row[column]);
}

function num(row: Row, column: string): number {
  return Number(row[column]);
}

function toDevice(row: Row): StoredDevice {
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

function toChallenge(row: Row): ChallengeRecord {
  return {
    challengeId: text(row, "challenge_id"),
    deviceId: text(row, "device_id"),
    nonce: text(row, "nonce"),
    expiresAtMs: num(row, "expires_at_ms"),
  };
}

function toInvitation(row: Row): InvitationRecord {
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

function toMailbox(row: Row): MailboxRecord {
  return {
    pairMailboxId: text(row, "pair_mailbox_id"),
    deviceIdA: text(row, "device_id_a"),
    deviceIdB: text(row, "device_id_b"),
    createdAtMs: num(row, "created_at_ms"),
  };
}

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
  ): Promise<boolean> {
    this.db.exec("BEGIN");
    try {
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
      return Promise.resolve(n > 0);
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
      "INSERT OR REPLACE INTO mailboxes (pair_mailbox_id, device_id_a, device_id_b, created_at_ms) VALUES (?, ?, ?, ?)",
      mailbox.pairMailboxId,
      mailbox.deviceIdA,
      mailbox.deviceIdB,
      mailbox.createdAtMs,
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
      "SELECT * FROM mailboxes WHERE device_id_a = ? OR device_id_b = ? LIMIT 1",
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
  ): Promise<readonly StoredEnvelope[]> {
    const rows = this.db
      .prepare(
        "SELECT seq, body FROM envelopes WHERE pair_mailbox_id = ? AND seq > ? ORDER BY seq LIMIT ?",
      )
      .all(pairMailboxId, after === null ? 0 : Number(after), limit);
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
  ): Promise<number> {
    let deleted = 0;
    for (const id of envelopeIds) {
      deleted += this.changed(
        "DELETE FROM envelopes WHERE envelope_id = ? AND pair_mailbox_id = ?",
        id,
        pairMailboxId,
      );
    }
    return Promise.resolve(deleted);
  }
}
