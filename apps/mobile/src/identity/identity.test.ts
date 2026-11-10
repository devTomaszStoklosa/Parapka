import { base64urlEncode, type Sodium } from "@parapka/crypto";
import { beforeAll, describe, expect, it } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { RelayError } from "../net/relay-error";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { createWebSodium } from "../platform/web-sodium";
import { createIdentity } from "./identity";

let sodium: Sodium;

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("missing value");
  return value;
}

beforeAll(async () => {
  sodium = await createWebSodium();
});

interface Storage {
  database?: ReturnType<typeof createMemoryDatabase>;
  keyStore?: ReturnType<typeof createMemoryKeyStore>;
}

function setup(storage: Storage = {}) {
  const database = storage.database ?? createMemoryDatabase();
  const keyStore = storage.keyStore ?? createMemoryKeyStore();
  const calls: string[] = [];
  const state = { offline: false, count: 0 };
  const identity = createIdentity({
    sodium,
    keyStore,
    database,
    relay: () => ({
      registerDevice: async (signingPublicKey) => {
        calls.push(signingPublicKey);
        await Promise.resolve();
        if (state.offline) throw new RelayError("network");
        state.count += 1;
        return { deviceId: `device-${String(state.count)}` };
      },
    }),
  });
  return { database, keyStore, calls, state, identity };
}

describe("Identity", () => {
  it("creates the keys and registers on the first launch", async () => {
    const { identity, calls, keyStore, database } = setup();
    expect(await identity.init()).toBe("registered");
    const keys = await identity.publicKeys();
    expect(calls).toEqual([base64urlEncode(must(keys).signing)]);
    expect(await identity.deviceId()).toBe("device-1");
    const signing = await keyStore.get("identity/signing-private");
    const agreement = await keyStore.get("identity/agreement-private");
    expect(signing).not.toBeNull();
    expect(agreement).not.toBeNull();
    const stored = JSON.stringify(await database.list("identity"));
    expect(stored).not.toContain(base64urlEncode(must(signing)));
    expect(stored).not.toContain(base64urlEncode(must(agreement)));
  });

  it("uses the stored keys on the next launch", async () => {
    const first = setup();
    await first.identity.init();
    const keys = await first.identity.publicKeys();
    const second = setup(first);
    expect(await second.identity.init()).toBe("registered");
    expect(second.calls).toEqual([]);
    expect(await second.identity.publicKeys()).toEqual(keys);
    expect(await second.identity.deviceId()).toBe("device-1");
  });

  it("waits for the network and retries with the same keys", async () => {
    const first = setup();
    first.state.offline = true;
    expect(await first.identity.init()).toBe("waitingForNetwork");
    expect(await first.identity.deviceId()).toBeNull();
    expect(await first.identity.credentials()).toBeNull();
    const keys = await first.identity.publicKeys();

    const second = setup(first);
    expect(await second.identity.init()).toBe("registered");
    expect(await second.identity.publicKeys()).toEqual(keys);
    expect(second.calls).toEqual([base64urlEncode(must(keys).signing)]);
  });

  it("retries in ensureRegistered", async () => {
    const { identity, state } = setup();
    state.offline = true;
    await identity.init();
    state.offline = false;
    expect(await identity.ensureRegistered()).toBe("registered");
    expect(await identity.deviceId()).toBe("device-1");
  });

  it("rethrows errors other than a missing network", async () => {
    const identity = createIdentity({
      sodium,
      keyStore: createMemoryKeyStore(),
      database: createMemoryDatabase(),
      relay: () => ({
        registerDevice: () => Promise.reject(new RelayError("invalid", 400)),
      }),
    });
    await expect(identity.init()).rejects.toThrow("relay error: invalid");
  });

  it("shares one registration between parallel calls", async () => {
    const { identity, calls } = setup();
    const states = await Promise.all([
      identity.init(),
      identity.ensureRegistered(),
    ]);
    expect(states).toEqual(["registered", "registered"]);
    expect(calls).toHaveLength(1);
  });

  it("generates new keys when the database lost the record", async () => {
    const first = setup();
    await first.identity.init();
    const old = await first.identity.publicKeys();
    const second = setup({ keyStore: first.keyStore });
    await second.identity.init();
    expect(await second.identity.publicKeys()).not.toEqual(old);
  });

  it("gives credentials only after the registration", async () => {
    const { identity, keyStore } = setup();
    await identity.init();
    const credentials = await identity.credentials();
    expect(credentials?.deviceId).toBe("device-1");
    expect(credentials?.signingPrivateKey).toEqual(
      await keyStore.get("identity/signing-private"),
    );
  });

  it("gives the agreement key pair after init() and null after clear()", async () => {
    const { identity, keyStore } = setup();
    expect(await identity.agreementKeyPair()).toBeNull();
    await identity.init();
    const pair = must(await identity.agreementKeyPair());
    expect(pair.publicKey).toEqual(must(await identity.publicKeys()).agreement);
    expect(pair.privateKey).toEqual(
      await keyStore.get("identity/agreement-private"),
    );
    await identity.clear();
    expect(await identity.agreementKeyPair()).toBeNull();
  });

  it("removes the keys and the device id on clear()", async () => {
    const { identity, keyStore, database } = setup();
    await identity.init();
    await identity.clear();
    expect(await identity.deviceId()).toBeNull();
    expect(await identity.publicKeys()).toBeNull();
    expect(await identity.credentials()).toBeNull();
    expect(await keyStore.get("identity/signing-private")).toBeNull();
    expect(await keyStore.get("identity/agreement-private")).toBeNull();
    expect(await database.list("identity")).toEqual([]);
  });
});
