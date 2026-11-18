import { expect, it, vi } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { RelayError } from "../net/relay-error";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { CLOSING } from "../sync/engine-state";
import { deleteAllData, type DeleteAllDeps } from "./delete-all";

const credentials = {
  deviceId: "me",
  signingPrivateKey: new Uint8Array(32),
};

interface Options {
  pair?: boolean;
  registered?: boolean;
  /** The closing of the mailbox fails: the marker stays. */
  closingFails?: boolean;
  markerWithoutPair?: boolean;
  deleteDevice?: () => Promise<void>;
  probe?: () => Promise<unknown>;
  localOnly?: boolean;
}

async function setup(options: Options = {}) {
  const calls: string[] = [];
  const database = createMemoryDatabase();
  const keyStore = createMemoryKeyStore();
  await database.put("profile", "me", { name: "Ola" });
  await keyStore.set("pair/send", new Uint8Array([1]));
  if (options.markerWithoutPair) {
    await database.put(CLOSING.collection, CLOSING.id, { pairMailboxId: "m" });
  }
  const deleteDevice = vi.fn(() => {
    calls.push("deleteDevice");
    return options.deleteDevice?.() ?? Promise.resolve();
  });
  const fetchEnvelopes = vi.fn((...args: unknown[]) => {
    calls.push(`probe:${String(args[0])}:${String(args[1])}`);
    return (options.probe?.() ?? Promise.resolve({})) as never;
  });
  const deps: DeleteAllDeps = {
    database,
    keyStore,
    pairs: {
      activePair: () =>
        Promise.resolve(
          options.pair === false ? null : ({ pairMailboxId: "m" } as never),
        ),
    },
    disconnect: async () => {
      calls.push("disconnect");
      if (options.closingFails) {
        await database.put(CLOSING.collection, CLOSING.id, {
          pairMailboxId: "m",
        });
      } else {
        calls.push("closeMailbox");
      }
    },
    credentials: vi.fn(() => {
      calls.push("credentials");
      return Promise.resolve(options.registered === false ? null : credentials);
    }),
    client: () => ({ deleteDevice, fetchEnvelopes }),
    ...(options.localOnly ? { localOnly: true } : {}),
  };
  const clear = database.clear.bind(database);
  vi.spyOn(database, "clear").mockImplementation(async () => {
    calls.push("clear");
    await clear();
  });
  return { deps, calls, database, keyStore, deleteDevice, fetchEnvelopes };
}

const kept = async (s: Awaited<ReturnType<typeof setup>>) =>
  (await s.database.get("profile", "me")) !== null &&
  (await s.keyStore.get("pair/send")) !== null;

it("disconnects, closes the mailbox, deletes the device and clears, in this order", async () => {
  const s = await setup();
  expect(await deleteAllData(s.deps)).toBe("done");
  expect(s.calls).toEqual([
    "credentials",
    "probe:m:null",
    "disconnect",
    "closeMailbox",
    "credentials",
    "deleteDevice",
    "clear",
  ]);
  expect(await s.keyStore.get("pair/send")).toBeNull();
  expect(await s.database.list("profile")).toEqual([]);
});

it("stays offline without deleting the device when the mailbox stays open", async () => {
  const s = await setup({ closingFails: true });
  expect(await deleteAllData(s.deps)).toBe("offline");
  expect(s.deleteDevice).not.toHaveBeenCalled();
  expect(s.calls).not.toContain("clear");
  expect(await kept(s)).toBe(true);
  expect(await s.database.get(CLOSING.collection, CLOSING.id)).not.toBeNull();
});

it("stays offline when a marker is left without a pair", async () => {
  const s = await setup({ pair: false, markerWithoutPair: true });
  expect(await deleteAllData(s.deps)).toBe("offline");
  expect(s.calls).toEqual([]);
  expect(await kept(s)).toBe(true);
});

it("stays offline and keeps the data when the device cannot be deleted", async () => {
  const s = await setup({
    deleteDevice: () => Promise.reject(new RelayError("network")),
  });
  expect(await deleteAllData(s.deps)).toBe("offline");
  expect(s.calls).not.toContain("clear");
  expect(await kept(s)).toBe(true);
});

it("stays offline on an error that is not a relay error", async () => {
  const s = await setup({ deleteDevice: () => Promise.reject(new Error("x")) });
  expect(await deleteAllData(s.deps)).toBe("offline");
});

it.each(["notFound", "unauthorized"] as const)(
  "treats %s as a deleted device",
  async (kind) => {
    const s = await setup({
      deleteDevice: () => Promise.reject(new RelayError(kind)),
    });
    expect(await deleteAllData(s.deps)).toBe("done");
    expect(s.calls).toContain("clear");
  },
);

it("deletes the device at once without a pair", async () => {
  const s = await setup({ pair: false });
  expect(await deleteAllData(s.deps)).toBe("done");
  expect(s.calls).toEqual(["credentials", "deleteDevice", "clear"]);
});

it("only clears without a registered device", async () => {
  const s = await setup({ pair: false, registered: false });
  expect(await deleteAllData(s.deps)).toBe("done");
  expect(s.calls).toEqual(["credentials", "clear"]);
});

it("makes no network call in the local-only variant", async () => {
  const s = await setup({ localOnly: true });
  expect(await deleteAllData(s.deps)).toBe("done");
  expect(s.calls).toEqual(["clear"]);
});

it("stays offline before ending the pair when the relay is unreachable", async () => {
  const s = await setup({
    probe: () => Promise.reject(new RelayError("network")),
  });
  expect(await deleteAllData(s.deps)).toBe("offline");
  expect(s.calls).toEqual(["credentials", "probe:m:null"]);
  expect(await kept(s)).toBe(true);
});

it("stays offline when the probe fails with a non-relay error", async () => {
  const s = await setup({ probe: () => Promise.reject(new Error("x")) });
  expect(await deleteAllData(s.deps)).toBe("offline");
  expect(s.calls).not.toContain("disconnect");
});

it.each(["notFound", "unauthorized"] as const)(
  "goes on when the probe answers %s",
  async (kind) => {
    const s = await setup({
      probe: () => Promise.reject(new RelayError(kind)),
    });
    expect(await deleteAllData(s.deps)).toBe("done");
    expect(s.calls).toContain("disconnect");
  },
);

it("skips the probe without credentials", async () => {
  const s = await setup({ registered: false });
  expect(await deleteAllData(s.deps)).toBe("done");
  expect(s.fetchEnvelopes).not.toHaveBeenCalled();
});
