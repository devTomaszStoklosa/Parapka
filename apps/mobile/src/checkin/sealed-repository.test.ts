import { expect, it } from "vitest";

import { ChoreDeviceError } from "../chores/chore-codec";
import { createMemoryDatabase } from "../data/memory-database";
import { createWebSodium } from "../platform/web-sodium";
import type { Pair } from "../pairing/pair-repository";
import { base64Encode } from "../sync/base64";
import { createSealedRepository } from "./sealed-repository";

async function setup(deviceId: string | null = "device-a") {
  const sodium = await createWebSodium();
  const database = createMemoryDatabase();
  const sealed = createSealedRepository({
    database,
    identity: { deviceId: () => Promise.resolve(deviceId) },
    pairs: { activePair: () => Promise.resolve(null) },
    sodium,
  });
  return { sealed, database };
}

it("needs the id of the device to seal", async () => {
  const { sealed } = await setup(null);
  await expect(sealed.submit("2026-W45", new Uint8Array([1]))).rejects.toThrow(
    ChoreDeviceError,
  );
});

it("numbers the versions per week and keeps the key in the own record", async () => {
  const { sealed, database } = await setup();
  await sealed.submit("2026-W45", new Uint8Array([1]));
  await sealed.submit("2026-W45", new Uint8Array([2]));
  await sealed.submit("2026-W46", new Uint8Array([3]));
  const rows = await database.list("checkin-sealed");
  expect(rows.map((row) => row.id)).toEqual([
    "2026-W45:device-a|1",
    "2026-W45:device-a|2",
    "2026-W46:device-a|1",
  ]);
  expect(await sealed.latestPartner("2026-W45")).toBeNull();
});

it("collects nothing when there is nothing to send, and ignores a delete", async () => {
  const { sealed } = await setup(null);
  expect(await sealed.sync.collect(() => "hlc")).toEqual([]);
  await sealed.sync.merge({
    entity: "CheckIn",
    id: "x",
    op: "delete",
    hlc: "hlc",
  });
  await sealed.sync.makePrivate();
  expect(await sealed.partnerFilled("2026-W45")).toBe(false);
});

it("lists the weeks and the newest own version with its key", async () => {
  const { sealed, database } = await setup();
  expect(await sealed.latestOwn("2026-W45")).toBeNull();
  await sealed.submit("2026-W45", new Uint8Array([1]));
  await sealed.submit("2026-W45", new Uint8Array([2]));
  await sealed.submit("2026-W46", new Uint8Array([3]));
  expect(await sealed.weeks()).toEqual(["2026-W45", "2026-W46"]);
  const rows = await database.list("checkin-sealed");
  const second = rows[1]?.value as { sealKey: string };
  expect(await sealed.latestOwn("2026-W45")).toEqual({
    checkinId: "2026-W45:device-a",
    version: 2,
    sealKey: second.sealKey,
  });
});

it("sends the newest own version of the week again", async () => {
  const { sealed } = await setup();
  await sealed.submit("2026-W45", new Uint8Array([1]));
  await sealed.submit("2026-W45", new Uint8Array([2]));
  await sealed.submit("2026-W44", new Uint8Array([3]));
  const hlc = "000000000000001-00000-device-a";
  await sealed.sync.commit(await sealed.sync.collect(() => hlc));
  await sealed.resendWeek("2026-W45");
  const again = await sealed.sync.collect(() => hlc);
  expect(again.map((change) => change.id)).toEqual(["2026-W45:device-a|2"]);
});

it("keeps the received version that is newer than the command", async () => {
  const sodium = await createWebSodium();
  const database = createMemoryDatabase();
  const sealed = createSealedRepository({
    database,
    identity: { deviceId: () => Promise.resolve("device-a") },
    pairs: {
      activePair: () => Promise.resolve({ deviceId: "partner" } as Pair),
    },
    sodium,
  });
  const stamp = "000000000000009-00000-partner";
  const field = (value: unknown) => ({ value, hlc: stamp });
  const bytes = base64Encode(new Uint8Array(24).fill(1));
  await sealed.sync.merge({
    entity: "CheckIn",
    id: "2026-W45:partner|1",
    op: "upsert",
    fields: {
      checkinId: field("2026-W45:partner"),
      week: field("2026-W45"),
      authorId: field("partner"),
      version: field(1),
      nonce: field(bytes),
      ciphertext: field(bytes),
    },
  });
  await sealed.forgetReceived("000000000000005-00000-partner");
  expect(await sealed.partnerFilled("2026-W45")).toBe(true);
  await sealed.forgetReceived(stamp);
  expect(await sealed.partnerFilled("2026-W45")).toBe(false);
});
