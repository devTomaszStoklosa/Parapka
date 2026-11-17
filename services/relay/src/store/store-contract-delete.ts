import type { Envelope } from "@parapka/protocol";
import { expect, it } from "vitest";
import type { RelayStore } from "./store.js";

type GetStore = () => RelayStore;

function envelope(id: string, mailbox: string, sender = "dev1"): Envelope {
  return {
    envelopeId: id,
    pairMailboxId: mailbox,
    senderDeviceId: sender,
    protocolVersion: 1,
    nonce: "AAAA",
    ciphertext: "BBBB",
  };
}

const INVITATION = {
  invitationId: "i1",
  deviceId: "a",
  expiresAtMs: 9,
  acceptedByDeviceId: null,
  encryptedKeysB: null,
};

async function listed(store: RelayStore, mailbox: string): Promise<string> {
  const list = await store.listEnvelopes(mailbox, null, 10);
  return list.map((e) => e.envelope.envelopeId).join();
}

function cascadeTests(store: GetStore): void {
  it("deletes the challenges, invitations and envelopes of a device", async () => {
    await store().putDevice({
      deviceId: "dev1",
      signingPublicKey: "k",
      createdAtMs: 1,
    });
    const c = { nonce: "n", expiresAtMs: 9 };
    await store().putChallenge({ ...c, challengeId: "c1", deviceId: "dev1" });
    await store().putChallenge({ ...c, challengeId: "c2", deviceId: "other" });
    await store().putInvitation({ ...INVITATION, deviceId: "dev1" });
    await store().addEnvelope(envelope("e1", "mb1"), 1);
    await store().addEnvelope(envelope("e2", "mb1", "x"), 1);
    expect(await store().deleteDevice("dev1")).toBe(true);
    expect(await store().takeChallenge("c1")).toBeNull();
    expect(await store().takeChallenge("c2")).not.toBeNull();
    expect(await store().getInvitation("i1")).toBeNull();
    expect(await listed(store(), "mb1")).toBe("e2");
  });
}

function closedMailboxTests(store: GetStore): void {
  it("keeps the envelopes of a closed mailbox for the partner", async () => {
    const mailbox = {
      pairMailboxId: "open",
      deviceIdA: "dev1",
      deviceIdB: "b",
    };
    await store().putMailbox({ ...mailbox, createdAtMs: 1 });
    await store().putMailbox({
      ...mailbox,
      pairMailboxId: "closed",
      createdAtMs: 1,
    });
    await store().closeMailbox("closed", 5, "dev1");
    await store().addEnvelope(envelope("e1", "open"), 1);
    await store().addEnvelope(envelope("e2", "closed"), 1);
    await store().addEnvelope(envelope("e3", "none"), 1);
    await store().addEnvelope(envelope("e4", "closed", "b"), 1);
    await store().deleteDevice("dev1");
    expect(await listed(store(), "open")).toBe("");
    expect(await listed(store(), "none")).toBe("");
    expect(await listed(store(), "closed")).toBe("e2,e4");
  });
}

function invitationTests(store: GetStore): void {
  it("deletes the invitations created or accepted by the device", async () => {
    await store().putInvitation({ ...INVITATION, deviceId: "dev1" });
    await store().putInvitation({
      ...INVITATION,
      invitationId: "i2",
      acceptedByDeviceId: "dev1",
      encryptedKeysB: "KEYS",
    });
    await store().putInvitation({ ...INVITATION, invitationId: "i3" });
    await store().deleteDevice("dev1");
    expect(await store().getInvitation("i1")).toBeNull();
    expect(await store().getInvitation("i2")).toBeNull();
    expect(await store().getInvitation("i3")).not.toBeNull();
  });
}

export function deviceCascadeTests(store: GetStore): void {
  cascadeTests(store);
  closedMailboxTests(store);
  invitationTests(store);
}
