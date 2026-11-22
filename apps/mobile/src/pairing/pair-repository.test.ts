import { describe, expect, it, vi } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { createPairRepository } from "./pair-repository";

const pair = {
  pairMailboxId: "mailbox",
  deviceId: "device-b",
  signingPublicKey: "sig",
  agreementPublicKey: "agr",
};
const keys = {
  sendKey: Uint8Array.from([1, 2, 3]),
  receiveKey: Uint8Array.from([4, 5, 6]),
};

function setup() {
  const database = createMemoryDatabase();
  const keyStore = createMemoryKeyStore();
  return {
    database,
    keyStore,
    repository: createPairRepository(database, keyStore),
  };
}

describe("PairRepository", () => {
  it("notifies after saving, confirming and removing, not after an empty confirm", async () => {
    const { repository, database, keyStore } = setup();
    const listener = vi.fn();
    repository.subscribe(listener);
    await repository.confirm();
    expect(listener).not.toHaveBeenCalled();
    await repository.savePending(pair, keys);
    expect(listener).toHaveBeenCalledTimes(1);
    await createPairRepository(database, keyStore).confirm();
    expect(listener).toHaveBeenCalledTimes(2);
    await repository.remove();
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("is empty at first", async () => {
    const { repository } = setup();
    expect(await repository.current()).toBeNull();
    expect(await repository.activePair()).toBeNull();
    expect(await repository.keys()).toBeNull();
  });

  it("saves a pending pair with the keys only in the key store", async () => {
    const { repository, database, keyStore } = setup();
    await repository.savePending(pair, keys);
    expect(await repository.current()).toEqual({
      ...pair,
      state: "pending-confirmation",
    });
    expect(await repository.activePair()).toBeNull();
    expect(await repository.keys()).toEqual(keys);
    expect(await keyStore.get("pair/send")).toEqual(keys.sendKey);
    expect(JSON.stringify(await database.list("pair"))).not.toContain(
      "sendKey",
    );
  });

  it("keeps a null partner device id", async () => {
    const { repository } = setup();
    await repository.savePending({ ...pair, deviceId: null }, keys);
    expect((await repository.current())?.deviceId).toBeNull();
  });

  it("returns a confirmed pair as the active one", async () => {
    const { repository } = setup();
    await repository.savePending(pair, keys);
    await repository.confirm();
    expect(await repository.activePair()).toEqual({
      ...pair,
      state: "confirmed",
      confirmedAtMs: expect.any(Number) as number,
    });
  });

  it("saves the moment of the confirmation from the clock", async () => {
    const { database, keyStore } = setup();
    const repository = createPairRepository(database, keyStore, {
      nowMs: () => 5_000,
    });
    await repository.savePending(pair, keys);
    expect((await repository.current())?.confirmedAtMs).toBeUndefined();
    await repository.confirm();
    expect((await repository.current())?.confirmedAtMs).toBe(5_000);
  });

  it("ignores confirm() without a pair", async () => {
    const { repository } = setup();
    await repository.confirm();
    expect(await repository.current()).toBeNull();
  });

  it("sets the device id of the partner and notifies", async () => {
    const { repository } = setup();
    await repository.savePending({ ...pair, deviceId: null }, keys);
    const listener = vi.fn();
    repository.subscribe(listener);
    const updated = await repository.setPartnerDeviceId("device-a");
    expect(updated?.deviceId).toBe("device-a");
    expect((await repository.current())?.deviceId).toBe("device-a");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("returns null from setPartnerDeviceId without a pair and writes nothing", async () => {
    const { repository } = setup();
    const listener = vi.fn();
    repository.subscribe(listener);
    expect(await repository.setPartnerDeviceId("device-a")).toBeNull();
    expect(await repository.current()).toBeNull();
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not overwrite a known device id of the partner", async () => {
    const { repository } = setup();
    await repository.savePending({ ...pair, deviceId: "known" }, keys);
    const listener = vi.fn();
    repository.subscribe(listener);
    const result = await repository.setPartnerDeviceId("other");
    expect(result?.deviceId).toBe("known");
    expect((await repository.current())?.deviceId).toBe("known");
    expect(listener).not.toHaveBeenCalled();
  });

  it("removes the record and the keys", async () => {
    const { repository, keyStore } = setup();
    await repository.savePending(pair, keys);
    await repository.remove();
    expect(await repository.current()).toBeNull();
    expect(await keyStore.get("pair/send")).toBeNull();
    expect(await keyStore.get("pair/receive")).toBeNull();
    expect(await repository.keys()).toBeNull();
  });
});
