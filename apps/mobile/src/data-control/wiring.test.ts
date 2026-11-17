import { afterEach, expect, it, vi } from "vitest";

import { wireChores } from "../chores/wiring";
import { createMemoryDatabase } from "../data/memory-database";
import { createIdentity } from "../identity/identity";
import type { Platform } from "../platform/context";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { webSha256 } from "../platform/sha256";
import { createWebSodium } from "../platform/web-sodium";
import { deleteAllData } from "./delete-all";
import { wireDeleteAll } from "./wiring";

afterEach(() => {
  vi.unstubAllGlobals();
});

async function platformWithDevice() {
  const sodium = await createWebSodium();
  const database = createMemoryDatabase();
  const keyStore = createMemoryKeyStore();
  await createIdentity({
    sodium,
    keyStore,
    database,
    relay: () => ({
      registerDevice: () => Promise.resolve({ deviceId: "me" }),
    }),
  }).init();
  return {
    sodium,
    keyStore,
    database,
    clock: { nowMs: () => 1_000 },
    sha256: webSha256,
    relayUrl: "unused-relay",
    appUrl: "unused",
  } as unknown as Platform;
}

function stubRelay(deleteStatus: number) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", (url: string, init: { method: string }) => {
    calls.push(`${init.method} ${url}`);
    const challenge = url.endsWith("/challenges");
    return Promise.resolve({
      status: challenge ? 201 : deleteStatus,
      text: () =>
        Promise.resolve(
          challenge ? JSON.stringify({ challengeId: "c", nonce: "n" }) : "{}",
        ),
    });
  });
  return calls;
}

it("deletes the device on the relay and clears the platform", async () => {
  const platform = await platformWithDevice();
  const calls = stubRelay(204);
  expect(await deleteAllData(wireDeleteAll(platform))).toBe("done");
  expect(
    calls.some((c) => c.startsWith("DELETE") && c.includes("/v1/devices/")),
  ).toBe(true);
  expect(await platform.database.list("identity")).toEqual([]);
});

it("treats a device unknown to the relay as deleted", async () => {
  const platform = await platformWithDevice();
  stubRelay(404);
  expect(await deleteAllData(wireDeleteAll(platform))).toBe("done");
});

it("does not call the relay in the local-only variant", async () => {
  const platform = await platformWithDevice();
  const calls = stubRelay(204);
  const deps = wireDeleteAll(platform, { localOnly: true });
  expect(await deleteAllData(deps)).toBe("done");
  expect(calls).toEqual([]);
  expect(await platform.database.list("identity")).toEqual([]);
});

it("ends the active pair before it deletes the device", async () => {
  const platform = await platformWithDevice();
  const calls = stubRelay(200);
  const deps = wireDeleteAll(platform);
  const { pairs } = wireChores(platform);
  await pairs.savePending(
    {
      pairMailboxId: "mailbox-1",
      deviceId: "partner",
      signingPublicKey: "s",
      agreementPublicKey: "a",
    },
    {
      sendKey: new Uint8Array(32).fill(1),
      receiveKey: new Uint8Array(32).fill(2),
    },
  );
  await pairs.confirm();
  expect(await deleteAllData({ ...deps })).toBe("offline");
  expect(
    calls.some((c) => c.startsWith("DELETE") && c.includes("/v1/devices/")),
  ).toBe(false);
});
