import { base64Decode } from "../../../apps/mobile/src/sync/base64";
import { decryptEnvelope } from "@parapka/crypto";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  createPairWorld,
  type Device,
  type PairWorld,
} from "./pair-test-support.js";
import { MemoryStore } from "./store/memory-store.js";

let world: PairWorld;

beforeEach(async () => {
  world = await createPairWorld({ store: new MemoryStore() });
});

afterEach(async () => {
  await world.app.close();
});

async function expectEndedHere(device: Device) {
  expect(await device.pairs.current()).toBeNull();
  expect(await device.pairs.keys()).toBeNull();
  expect(await device.partner.get()).toBeNull();
  expect(await device.consent.current()).toBeNull();
  expect(await device.disconnected.state()).toBe("none");
}

const marker = (device: Device) =>
  device.database.get("pair-closing", "current");

it("disconnects online: B ends by-partner and the mailbox is closed", async () => {
  const { newDevice, pair, exchangeProfiles, resend, expectEndedByPartner } =
    world;
  const a = await newDevice("a");
  const b = await newDevice("b");
  const { pairMailboxId } = await pair(a, b);
  await exchangeProfiles(a, b);

  await a.disconnect();
  await expectEndedHere(a);
  expect(await marker(a)).toBeNull();
  expect(await resend(b, pairMailboxId)).toMatchObject({
    kind: "expired",
    status: 410,
  });

  await expectEndedByPartner(b);
});

it("disconnects offline: A loses data at once, the relay learns later", async () => {
  const {
    newDevice,
    pair,
    exchangeProfiles,
    resend,
    expectEndedByPartner,
    offline,
  } = world;
  const a = await newDevice("a");
  const b = await newDevice("b");
  const { pairMailboxId } = await pair(a, b);
  await exchangeProfiles(a, b);

  offline.add("a");
  await a.disconnect();
  await expectEndedHere(a);
  expect(await marker(a)).toEqual({ pairMailboxId });
  expect(await resend(b, pairMailboxId)).toBeNull();

  offline.delete("a");
  expect(await a.finishClosing()).toBe(true);
  expect(await marker(a)).toBeNull();
  expect(await resend(b, pairMailboxId)).toMatchObject({ status: 410 });

  await expectEndedByPartner(b);
});

it("reconnects the same people with new keys and default consents", async () => {
  const {
    newDevice,
    pair,
    exchangeProfiles,
    expectEndedByPartner,
    sent,
    sodium,
  } = world;
  const a = await newDevice("a");
  const b = await newDevice("b");
  const first = await pair(a, b);
  await exchangeProfiles(a, b);
  const old = sent.filter((e) => e.pairMailboxId === first.pairMailboxId);
  expect(old.length).toBeGreaterThan(0);

  await a.disconnect();
  await expectEndedByPartner(b);
  await b.disconnected.acknowledge();
  expect(await a.consent.current()).toBeNull();
  expect(await b.consent.current()).toBeNull();

  const second = await pair(a, b);
  expect(second.pairMailboxId).not.toBe(first.pairMailboxId);
  expect(second.keys.b.receiveKey).not.toEqual(first.keys.b.receiveKey);
  await exchangeProfiles(a, b);

  for (const envelope of old) {
    expect(() =>
      decryptEnvelope(sodium, second.keys.b.receiveKey, envelope, {
        nonce: base64Decode(envelope.nonce),
        ciphertext: base64Decode(envelope.ciphertext),
      }),
    ).toThrow();
  }
  const fresh = sent.filter((e) => e.pairMailboxId === second.pairMailboxId);
  expect(fresh.length).toBeGreaterThan(0);
});
