import type { Envelope } from "@parapka/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import type { RelayStore } from "./store.js";

type GetStore = () => RelayStore;

function envelope(id: string, mailbox = "mb1"): Envelope {
  return {
    envelopeId: id,
    pairMailboxId: mailbox,
    senderDeviceId: "dev1",
    protocolVersion: 1,
    nonce: "AAAA",
    ciphertext: "BBBB",
  };
}

const MAILBOX = {
  pairMailboxId: "mb1",
  deviceIdA: "a",
  deviceIdB: "b",
  createdAtMs: 3,
};

const INVITATION = {
  invitationId: "i1",
  deviceId: "a",
  expiresAtMs: 9,
  acceptedByDeviceId: null,
  encryptedKeysB: null,
};

function ids(list: readonly { envelope: Envelope }[]): string[] {
  return list.map((e) => e.envelope.envelopeId);
}

function deviceTests(store: GetStore): void {
  it("stores devices and push tokens", async () => {
    expect(await store().getDevice("d1")).toBeNull();
    await store().putDevice({
      deviceId: "d1",
      signingPublicKey: "KEY",
      createdAtMs: 5,
    });
    expect(await store().getDevice("d1")).toEqual({
      deviceId: "d1",
      signingPublicKey: "KEY",
      createdAtMs: 5,
      push: null,
    });
    const push = { platform: "fcm", token: "tok" } as const;
    expect(await store().setPushToken("d1", push)).toBe(true);
    expect((await store().getDevice("d1"))?.push).toEqual(push);
    expect(await store().setPushToken("nope", push)).toBe(false);
    expect(await store().deleteDevice("d1")).toBe(true);
    expect(await store().deleteDevice("d1")).toBe(false);
    expect(await store().getDevice("d1")).toBeNull();
  });
}

function shortLivedTests(store: GetStore): void {
  it("lets a challenge be taken once", async () => {
    const challenge = {
      challengeId: "c1",
      deviceId: "d1",
      nonce: "N",
      expiresAtMs: 10,
    };
    await store().putChallenge(challenge);
    expect(await store().takeChallenge("c1")).toEqual(challenge);
    expect(await store().takeChallenge("c1")).toBeNull();
  });

  it("stores and deletes invitations", async () => {
    const invitation = { ...INVITATION, invitationId: "i1", deviceId: "d1" };
    await store().putInvitation(invitation);
    expect(await store().getInvitation("i1")).toEqual(invitation);
    expect(await store().deleteInvitation("i1")).toBe(true);
    expect(await store().deleteInvitation("i1")).toBe(false);
    expect(await store().getInvitation("i1")).toBeNull();
  });

  it("purges expired challenges and invitations only", async () => {
    const challenge = { deviceId: "d", nonce: "N" };
    await store().putChallenge({
      ...challenge,
      challengeId: "old",
      expiresAtMs: 10,
    });
    await store().putChallenge({
      ...challenge,
      challengeId: "new",
      expiresAtMs: 11,
    });
    await store().putInvitation({
      ...INVITATION,
      invitationId: "old",
      deviceId: "d",
      expiresAtMs: 10,
    });
    await store().purgeExpired(10);
    expect(await store().takeChallenge("old")).toBeNull();
    expect(await store().takeChallenge("new")).not.toBeNull();
    expect(await store().getInvitation("old")).toBeNull();
  });
}

function envelopeTests(store: GetStore): void {
  it("lists envelopes in order after a cursor", async () => {
    const first = await store().addEnvelope(envelope("e1"), 1);
    await store().addEnvelope(envelope("e2"), 2);
    await store().addEnvelope(envelope("x1", "other"), 3);
    await store().addEnvelope(envelope("e3"), 4);

    expect(ids(await store().listEnvelopes("mb1", null, 10))).toEqual([
      "e1",
      "e2",
      "e3",
    ]);
    expect(ids(await store().listEnvelopes("mb1", first.cursor, 10))).toEqual([
      "e2",
      "e3",
    ]);
    expect(await store().listEnvelopes("mb1", null, 2)).toHaveLength(2);
  });

  it("accepts an envelope id only once", async () => {
    const first = await store().addEnvelope(envelope("e1"), 1);
    const again = await store().addEnvelope(envelope("e1"), 2);
    expect(first.accepted).toBe(true);
    expect(again).toEqual({ cursor: first.cursor, accepted: false });
    expect(await store().listEnvelopes("mb1", null, 10)).toHaveLength(1);
  });

  it("deletes acknowledged envelopes of the mailbox only", async () => {
    await store().addEnvelope(envelope("e1"), 1);
    await store().addEnvelope(envelope("e2"), 2);
    await store().addEnvelope(envelope("x1", "other"), 3);
    expect(await store().deleteEnvelopes("mb1", ["e1", "x1", "zz"])).toBe(1);
    expect(ids(await store().listEnvelopes("mb1", null, 10))).toEqual(["e2"]);
    expect(await store().listEnvelopes("other", null, 10)).toHaveLength(1);
  });
}

function senderAndExpiryTests(store: GetStore): void {
  it("skips envelopes of one sender before the limit applies", async () => {
    const from = (id: string, sender: string): Envelope => ({
      ...envelope(id),
      senderDeviceId: sender,
    });
    await store().addEnvelope(from("e1", "a"), 1);
    await store().addEnvelope(from("e2", "a"), 2);
    await store().addEnvelope(from("e3", "b"), 3);
    expect(ids(await store().listEnvelopes("mb1", null, 1, "a"))).toEqual([
      "e3",
    ]);
    expect(await store().deleteEnvelopes("mb1", ["e1", "e3"], "a")).toBe(1);
    expect(ids(await store().listEnvelopes("mb1", null, 10))).toEqual([
      "e1",
      "e2",
    ]);
  });

  it("deletes envelopes received at or before a time", async () => {
    await store().addEnvelope(envelope("e1"), 10);
    await store().addEnvelope(envelope("e2"), 11);
    expect(await store().deleteEnvelopesReceivedBefore(10)).toBe(1);
    expect(ids(await store().listEnvelopes("mb1", null, 10))).toEqual(["e2"]);
  });
}

function newerVersionTests(store: GetStore): void {
  it("keeps fields of a newer protocol version", async () => {
    const newer = { ...envelope("e1"), extra: "kept" } as Envelope;
    await store().addEnvelope(newer, 1);
    const [stored] = await store().listEnvelopes("mb1", null, 1);
    expect(stored?.envelope).toEqual(newer);
  });
}

function mailboxTests(store: GetStore): void {
  it("stores mailboxes", async () => {
    await store().putMailbox(MAILBOX);
    expect(await store().getMailbox("mb1")).toEqual(MAILBOX);
    expect(await store().getMailbox("mb2")).toBeNull();
  });

  it("finds the mailbox of either device", async () => {
    await store().putMailbox(MAILBOX);
    expect(await store().findMailboxByDevice("a")).toEqual(MAILBOX);
    expect(await store().findMailboxByDevice("b")).toEqual(MAILBOX);
    expect(await store().findMailboxByDevice("c")).toBeNull();
  });

  it("deletes a mailbox with its envelopes", async () => {
    await store().putMailbox(MAILBOX);
    await store().addEnvelope(envelope("e1"), 1);
    expect(await store().deleteMailbox("mb1")).toBe(true);
    expect(await store().getMailbox("mb1")).toBeNull();
    expect(await store().listEnvelopes("mb1", null, 10)).toEqual([]);
    expect(await store().deleteMailbox("mb1")).toBe(false);
  });
}

function acceptTests(store: GetStore): void {
  it("accepts an invitation once and creates the mailbox", async () => {
    await store().putInvitation(INVITATION);
    expect(await store().acceptInvitation("i1", "b", "KEYS", MAILBOX)).toBe(
      "accepted",
    );
    expect(await store().getInvitation("i1")).toEqual({
      ...INVITATION,
      acceptedByDeviceId: "b",
      encryptedKeysB: "KEYS",
    });
    expect(await store().getMailbox("mb1")).toEqual(MAILBOX);

    const second = { ...MAILBOX, pairMailboxId: "mb2", deviceIdB: "c" };
    expect(await store().acceptInvitation("i1", "c", "OTHER", second)).toBe(
      "used",
    );
    expect((await store().getInvitation("i1"))?.acceptedByDeviceId).toBe("b");
    expect(await store().getMailbox("mb2")).toBeNull();
  });

  it("does not accept an unknown invitation", async () => {
    expect(await store().acceptInvitation("zz", "b", "KEYS", MAILBOX)).toBe(
      "used",
    );
    expect(await store().getMailbox("mb1")).toBeNull();
  });

  it("does not accept for a device that is already paired", async () => {
    await store().putInvitation(INVITATION);
    await store().putInvitation({ ...INVITATION, invitationId: "i2" });
    await store().acceptInvitation("i1", "b", "KEYS", MAILBOX);
    const second = { ...MAILBOX, pairMailboxId: "mb2", deviceIdB: "c" };
    expect(await store().acceptInvitation("i2", "c", "OTHER", second)).toBe(
      "paired",
    );
    expect((await store().getInvitation("i2"))?.acceptedByDeviceId).toBeNull();
    expect(await store().getMailbox("mb2")).toBeNull();
  });
}

function closingTests(store: GetStore): void {
  it("closes a mailbox once and keeps the first closing time", async () => {
    expect(await store().closeMailbox("mb1", 5)).toBe(false);
    await store().putMailbox(MAILBOX);
    expect(await store().closeMailbox("mb1", 5)).toBe(true);
    expect(await store().closeMailbox("mb1", 8)).toBe(true);
    expect(await store().getMailbox("mb1")).toEqual({
      ...MAILBOX,
      closedAtMs: 5,
    });
  });

  it("deletes closed mailboxes closed at or before the cutoff", async () => {
    await store().putMailbox(MAILBOX);
    await store().putMailbox({ ...MAILBOX, pairMailboxId: "mb2" });
    await store().putMailbox({ ...MAILBOX, pairMailboxId: "mb3" });
    await store().addEnvelope(envelope("e1"), 1);
    await store().addEnvelope(envelope("e2", "mb2"), 1);
    await store().closeMailbox("mb1", 10);
    await store().closeMailbox("mb2", 11);
    expect(await store().deleteClosedMailboxesBefore(10)).toBe(1);
    expect(await store().getMailbox("mb1")).toBeNull();
    expect(await store().listEnvelopes("mb1", null, 10)).toEqual([]);
    expect(await store().getMailbox("mb2")).not.toBeNull();
    expect(await store().getMailbox("mb3")).not.toBeNull();
    expect(ids(await store().listEnvelopes("mb2", null, 10))).toEqual(["e2"]);
  });
}

function deviceCascadeTests(store: GetStore): void {
  it("deletes the challenges, invitations and envelopes of a device", async () => {
    await store().putDevice({
      deviceId: "dev1",
      signingPublicKey: "k",
      createdAtMs: 1,
    });
    await store().putChallenge({
      challengeId: "c1",
      deviceId: "dev1",
      nonce: "n",
      expiresAtMs: 9,
    });
    await store().putChallenge({
      challengeId: "c2",
      deviceId: "other",
      nonce: "n",
      expiresAtMs: 9,
    });
    await store().putInvitation({ ...INVITATION, deviceId: "dev1" });
    await store().addEnvelope(envelope("e1"), 1);
    await store().addEnvelope({ ...envelope("e2"), senderDeviceId: "x" }, 1);
    expect(await store().deleteDevice("dev1")).toBe(true);
    expect(await store().takeChallenge("c1")).toBeNull();
    expect(await store().takeChallenge("c2")).not.toBeNull();
    expect(await store().getInvitation("i1")).toBeNull();
    expect(ids(await store().listEnvelopes("mb1", null, 10))).toEqual(["e2"]);
  });
}

/** One set of tests that every `RelayStore` implementation must pass. */
export function runStoreContract(name: string, create: GetStore): void {
  describe(`store contract: ${name}`, () => {
    let current: RelayStore;
    beforeEach(() => {
      current = create();
    });
    const store: GetStore = () => current;

    deviceTests(store);
    shortLivedTests(store);
    envelopeTests(store);
    senderAndExpiryTests(store);
    newerVersionTests(store);
    mailboxTests(store);
    acceptTests(store);
    closingTests(store);
    deviceCascadeTests(store);
  });
}
