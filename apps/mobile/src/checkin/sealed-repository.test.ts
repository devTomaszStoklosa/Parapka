import { expect, it } from "vitest";

import { ChoreDeviceError } from "../chores/chore-codec";
import { createMemoryDatabase } from "../data/memory-database";
import { createWebSodium } from "../platform/web-sodium";
import { createSealedRepository } from "./sealed-repository";

async function setup(deviceId: string | null = "device-a") {
  const sodium = await createWebSodium();
  const database = createMemoryDatabase();
  const sealed = createSealedRepository({
    database,
    identity: { deviceId: () => Promise.resolve(deviceId) },
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
