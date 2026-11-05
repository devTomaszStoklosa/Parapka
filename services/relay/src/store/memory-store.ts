import type { Envelope } from "@parapka/protocol";
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

interface Row {
  readonly seq: number;
  readonly receivedAtMs: number;
  readonly envelope: Envelope;
}

/** Simple in-memory store, the reference for the store contract. */
export class MemoryStore implements RelayStore {
  private readonly devices = new Map<string, StoredDevice>();
  private readonly challenges = new Map<string, ChallengeRecord>();
  private readonly invitations = new Map<string, InvitationRecord>();
  private readonly mailboxes = new Map<string, MailboxRecord>();
  private readonly envelopes = new Map<string, Row>();
  private lastSeq = 0;

  putDevice(device: DeviceRecord): Promise<void> {
    this.devices.set(device.deviceId, { ...device, push: null });
    return Promise.resolve();
  }

  getDevice(deviceId: string): Promise<StoredDevice | null> {
    return Promise.resolve(this.devices.get(deviceId) ?? null);
  }

  setPushToken(deviceId: string, push: PushToken): Promise<boolean> {
    const device = this.devices.get(deviceId);
    if (device === undefined) return Promise.resolve(false);
    this.devices.set(deviceId, { ...device, push });
    return Promise.resolve(true);
  }

  deleteDevice(deviceId: string): Promise<boolean> {
    for (const [id, c] of this.challenges) {
      if (c.deviceId === deviceId) this.challenges.delete(id);
    }
    for (const [id, i] of this.invitations) {
      if (i.deviceId === deviceId) this.invitations.delete(id);
    }
    for (const [id, row] of this.envelopes) {
      if (row.envelope.senderDeviceId === deviceId) this.envelopes.delete(id);
    }
    return Promise.resolve(this.devices.delete(deviceId));
  }

  putChallenge(challenge: ChallengeRecord): Promise<void> {
    this.challenges.set(challenge.challengeId, challenge);
    return Promise.resolve();
  }

  takeChallenge(challengeId: string): Promise<ChallengeRecord | null> {
    const challenge = this.challenges.get(challengeId) ?? null;
    this.challenges.delete(challengeId);
    return Promise.resolve(challenge);
  }

  putInvitation(invitation: InvitationRecord): Promise<void> {
    this.invitations.set(invitation.invitationId, invitation);
    return Promise.resolve();
  }

  getInvitation(invitationId: string): Promise<InvitationRecord | null> {
    return Promise.resolve(this.invitations.get(invitationId) ?? null);
  }

  deleteInvitation(invitationId: string): Promise<boolean> {
    return Promise.resolve(this.invitations.delete(invitationId));
  }

  acceptInvitation(
    invitationId: string,
    deviceId: string,
    encryptedKeysB: string,
    mailbox: MailboxRecord,
  ): Promise<AcceptResult> {
    const invitation = this.invitations.get(invitationId);
    if (invitation === undefined || invitation.acceptedByDeviceId !== null) {
      return Promise.resolve("used");
    }
    const paired = [...this.mailboxes.values()].some(
      (m) =>
        [m.deviceIdA, m.deviceIdB].includes(mailbox.deviceIdA) ||
        [m.deviceIdA, m.deviceIdB].includes(mailbox.deviceIdB),
    );
    if (paired) return Promise.resolve("paired");
    this.invitations.set(invitationId, {
      ...invitation,
      acceptedByDeviceId: deviceId,
      encryptedKeysB,
    });
    this.mailboxes.set(mailbox.pairMailboxId, mailbox);
    return Promise.resolve("accepted");
  }

  purgeExpired(nowMs: number): Promise<void> {
    for (const [id, c] of this.challenges) {
      if (c.expiresAtMs <= nowMs) this.challenges.delete(id);
    }
    for (const [id, i] of this.invitations) {
      if (i.expiresAtMs <= nowMs) this.invitations.delete(id);
    }
    return Promise.resolve();
  }

  putMailbox(mailbox: MailboxRecord): Promise<void> {
    this.mailboxes.set(mailbox.pairMailboxId, mailbox);
    return Promise.resolve();
  }

  getMailbox(pairMailboxId: string): Promise<MailboxRecord | null> {
    return Promise.resolve(this.mailboxes.get(pairMailboxId) ?? null);
  }

  findMailboxByDevice(deviceId: string): Promise<MailboxRecord | null> {
    for (const mailbox of this.mailboxes.values()) {
      if (mailbox.deviceIdA === deviceId || mailbox.deviceIdB === deviceId) {
        return Promise.resolve(mailbox);
      }
    }
    return Promise.resolve(null);
  }

  deleteMailbox(pairMailboxId: string): Promise<boolean> {
    for (const [id, row] of this.envelopes) {
      if (row.envelope.pairMailboxId === pairMailboxId) {
        this.envelopes.delete(id);
      }
    }
    return Promise.resolve(this.mailboxes.delete(pairMailboxId));
  }

  closeMailbox(pairMailboxId: string, closedAtMs: number): Promise<boolean> {
    const mailbox = this.mailboxes.get(pairMailboxId);
    if (mailbox === undefined) return Promise.resolve(false);
    this.mailboxes.set(pairMailboxId, {
      ...mailbox,
      closedAtMs: mailbox.closedAtMs ?? closedAtMs,
    });
    return Promise.resolve(true);
  }

  async deleteClosedMailboxesBefore(cutoffMs: number): Promise<number> {
    let deleted = 0;
    for (const [id, mailbox] of [...this.mailboxes]) {
      if (mailbox.closedAtMs !== undefined && mailbox.closedAtMs <= cutoffMs) {
        await this.deleteMailbox(id);
        deleted += 1;
      }
    }
    return deleted;
  }

  addEnvelope(
    envelope: Envelope,
    receivedAtMs: number,
  ): Promise<{ readonly cursor: string; readonly accepted: boolean }> {
    const existing = this.envelopes.get(envelope.envelopeId);
    if (existing !== undefined) {
      return Promise.resolve({ cursor: String(existing.seq), accepted: false });
    }
    this.lastSeq += 1;
    this.envelopes.set(envelope.envelopeId, {
      seq: this.lastSeq,
      receivedAtMs,
      envelope,
    });
    return Promise.resolve({ cursor: String(this.lastSeq), accepted: true });
  }

  listEnvelopes(
    pairMailboxId: string,
    after: string | null,
    limit: number,
    excludeSenderDeviceId?: string,
  ): Promise<readonly StoredEnvelope[]> {
    const afterSeq = after === null ? 0 : Number(after);
    const rows = [...this.envelopes.values()]
      .filter(
        (r) =>
          r.envelope.pairMailboxId === pairMailboxId &&
          r.seq > afterSeq &&
          r.envelope.senderDeviceId !== excludeSenderDeviceId,
      )
      .sort((a, b) => a.seq - b.seq)
      .slice(0, limit);
    return Promise.resolve(
      rows.map((r) => ({ cursor: String(r.seq), envelope: r.envelope })),
    );
  }

  deleteEnvelopes(
    pairMailboxId: string,
    envelopeIds: readonly string[],
    excludeSenderDeviceId?: string,
  ): Promise<number> {
    let deleted = 0;
    for (const id of envelopeIds) {
      const row = this.envelopes.get(id);
      if (
        row?.envelope.pairMailboxId === pairMailboxId &&
        row.envelope.senderDeviceId !== excludeSenderDeviceId
      ) {
        this.envelopes.delete(id);
        deleted += 1;
      }
    }
    return Promise.resolve(deleted);
  }

  deleteEnvelopesReceivedBefore(cutoffMs: number): Promise<number> {
    let deleted = 0;
    for (const [id, row] of this.envelopes) {
      if (row.receivedAtMs <= cutoffMs) {
        this.envelopes.delete(id);
        deleted += 1;
      }
    }
    return Promise.resolve(deleted);
  }
}
