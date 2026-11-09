import { expect, it } from "vitest";
import { createMemoryDatabase } from "../data/memory-database";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { createPairRepository } from "./pair-repository";

const record = {
  pairMailboxId: "mailbox",
  partnerDeviceId: "device-b",
  partnerSigningPublicKey: "sign",
  partnerAgreementPublicKey: "agree",
};
const keys = { sendKey: Uint8Array.of(1, 2), receiveKey: Uint8Array.of(3, 4) };

function setup() {
  const keyStore = createMemoryKeyStore();
  return {
    keyStore,
    pairs: createPairRepository(createMemoryDatabase(), keyStore),
  };
}

it("has no pair at first", async () => {
  const { pairs } = setup();
  expect(await pairs.get()).toBeNull();
  expect(await pairs.active()).toBeNull();
});

it("keeps a saved pair pending and out of sync until it is confirmed", async () => {
  const { pairs, keyStore } = setup();
  await pairs.savePending(record, keys);
  expect(await pairs.get()).toEqual({
    ...record,
    state: "pending-confirmation",
  });
  expect(await pairs.active()).toBeNull();
  expect(await keyStore.get("pair/send-key")).toEqual(keys.sendKey);
  expect(await keyStore.get("pair/receive-key")).toEqual(keys.receiveKey);
});

it("returns the confirmed pair with its keys", async () => {
  const { pairs } = setup();
  await pairs.savePending(record, keys);
  await pairs.confirm();
  expect(await pairs.active()).toEqual({
    record: { ...record, state: "confirmed" },
    keys,
  });
});

it("is not active without its keys", async () => {
  const { pairs, keyStore } = setup();
  await pairs.savePending(record, keys);
  await pairs.confirm();
  await keyStore.delete("pair/send-key");
  expect(await pairs.active()).toBeNull();
});

it("removes the record and the keys on reject", async () => {
  const { pairs, keyStore } = setup();
  await pairs.savePending(record, keys);
  await pairs.reject();
  expect(await pairs.get()).toBeNull();
  expect(await keyStore.get("pair/send-key")).toBeNull();
  expect(await keyStore.get("pair/receive-key")).toBeNull();
});

it("ignores confirm without a pair", async () => {
  const { pairs } = setup();
  await pairs.confirm();
  expect(await pairs.get()).toBeNull();
});
