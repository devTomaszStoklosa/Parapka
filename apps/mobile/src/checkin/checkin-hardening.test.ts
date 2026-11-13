import type { ContentChange } from "@parapka/protocol";
import { expect, it, vi } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import type { Pair } from "../pairing/pair-repository";
import { createWebSodium } from "../platform/web-sodium";
import { base64Encode } from "../sync/base64";
import { parseKey } from "./key-codec";
import { createKeyRepository } from "./key-repository";
import { MAX_VERSION, parseSealed } from "./sealed-codec";
import { createSealedRepository } from "./sealed-repository";

const hlc = "000000000000001-00000-partner";
const KEY = base64Encode(new Uint8Array(32).fill(7));
const OTHER_KEY = base64Encode(new Uint8Array(32).fill(8));
const NONCE = base64Encode(new Uint8Array(24).fill(1));
const CIPHERTEXT = base64Encode(new Uint8Array([1, 2, 3]));
const CHECKIN = "2026-W45:partner";

const change = (
  entity: string,
  id: string,
  fields: Record<string, unknown>,
): ContentChange => ({
  entity,
  id,
  op: "upsert",
  fields: Object.fromEntries(
    Object.entries(fields).map(([name, value]) => [name, { value, hlc }]),
  ),
});

const keyChange = (version: number, key = KEY) =>
  change("CheckInKey", `${CHECKIN}|${String(version)}`, {
    checkinId: CHECKIN,
    version,
    key,
  });

const sealedChange = (version: number) =>
  change("CheckIn", `${CHECKIN}|${String(version)}`, {
    checkinId: CHECKIN,
    week: "2026-W45",
    authorId: "partner",
    version,
    nonce: NONCE,
    ciphertext: CIPHERTEXT,
  });

const pairOf = (partner: string | null) => ({
  activePair: () =>
    Promise.resolve(partner === null ? null : ({ deviceId: partner } as Pair)),
});

async function setup(partner: string | null = "partner") {
  const database = createMemoryDatabase();
  const keys = createKeyRepository({ database, pairs: pairOf(partner) });
  const sealed = createSealedRepository({
    database,
    identity: { deviceId: () => Promise.resolve("me") },
    pairs: pairOf(partner),
    sodium: await createWebSodium(),
  });
  return { keys, sealed };
}

it("skips the versions and keys above the highest version", () => {
  expect(parseKey(keyChange(MAX_VERSION), "partner")).not.toBeNull();
  expect(parseKey(keyChange(MAX_VERSION + 1), "partner")).toBeNull();
  expect(parseSealed(sealedChange(MAX_VERSION), "partner")).not.toBeNull();
  expect(parseSealed(sealedChange(MAX_VERSION + 1), "partner")).toBeNull();
});

it("takes in nothing without an active pair", async () => {
  const { keys, sealed } = await setup(null);
  await keys.sync.merge(keyChange(1));
  await sealed.sync.merge(sealedChange(1));
  expect(await keys.partnerKey(CHECKIN, 1)).toBeNull();
  expect(await sealed.partnerVersions("2026-W45")).toEqual([]);
});

it("takes in the versions and keys of the partner of the pair", async () => {
  const { keys, sealed } = await setup();
  await keys.sync.merge(keyChange(1));
  await sealed.sync.merge(sealedChange(1));
  expect(await keys.partnerKey(CHECKIN, 1)).toMatchObject({ key: KEY });
  expect(await sealed.partnerVersions("2026-W45")).toHaveLength(1);
});

it("notifies the subscribers when it forgets the received records", async () => {
  const { keys, sealed } = await setup();
  const onKeys = vi.fn();
  const onSealed = vi.fn();
  keys.subscribe(onKeys);
  sealed.subscribe(onSealed);
  await keys.forgetReceived();
  await sealed.forgetReceived();
  expect(onKeys).toHaveBeenCalledTimes(1);
  expect(onSealed).toHaveBeenCalledTimes(1);
});

it("replaces the key of a version by another one and ignores the same", async () => {
  const { keys } = await setup();
  const onKeys = vi.fn();
  await keys.sync.merge(keyChange(1, OTHER_KEY));
  keys.subscribe(onKeys);
  await keys.sync.merge(keyChange(1, OTHER_KEY));
  expect(onKeys).not.toHaveBeenCalled();
  await keys.sync.merge(keyChange(1));
  expect(await keys.partnerKey(CHECKIN, 1)).toMatchObject({ key: KEY });
  expect(onKeys).toHaveBeenCalledTimes(1);
});
