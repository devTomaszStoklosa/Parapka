import type { ContentChange } from "@parapka/protocol";
import { expect, it } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import type { Pair } from "../pairing/pair-repository";
import { base64Encode } from "../sync/base64";
import { createKeyRepository } from "./key-repository";
import { weekOfChange } from "./window-sweep";

type Upsert = Extract<ContentChange, { op: "upsert" }>;

const change = (fields: Upsert["fields"]): ContentChange => ({
  entity: "CheckInKey",
  id: "x",
  op: "upsert",
  fields,
});
const hlc = "000000000000001-00000-device-a";

it("takes the week from the prefix of the id of the check-in", () => {
  expect(
    weekOfChange(change({ checkinId: { value: "2026-W45:device-a", hlc } })),
  ).toBe("2026-W45");
});

it("gives no week for a change without a valid id of a check-in", () => {
  expect(weekOfChange(change({}))).toBeNull();
  expect(weekOfChange(change({ checkinId: { value: 5, hlc } }))).toBeNull();
  expect(
    weekOfChange(change({ checkinId: { value: "device-a", hlc } })),
  ).toBeNull();
});

it("gives no week for a delete", () => {
  expect(
    weekOfChange({ entity: "CheckInKey", id: "x", op: "delete", hlc }),
  ).toBeNull();
});

const KEY = base64Encode(new Uint8Array(32).fill(7));

const received = (checkinId: string): ContentChange => ({
  entity: "CheckInKey",
  id: `${checkinId}|1`,
  op: "upsert",
  fields: Object.fromEntries(
    Object.entries({ checkinId, version: 1, key: KEY }).map(([n, value]) => [
      n,
      { value, hlc },
    ]),
  ),
});

it("lists the weeks, and drops received and unsent keys of one week only", async () => {
  const keys = createKeyRepository({
    database: createMemoryDatabase(),
    pairs: {
      activePair: () =>
        Promise.resolve({ deviceId: "partner" } as unknown as Pair),
    },
  });
  await keys.addOwn("2026-W45:me", 1, KEY);
  await keys.addOwn("2026-W46:me", 1, KEY);
  await keys.sync.merge(received("2026-W45:partner"));
  await keys.sync.merge(received("2026-W46:partner"));
  expect((await keys.weeks()).sort()).toEqual(["2026-W45", "2026-W46"]);
  expect(await keys.ownSent("2026-W45")).toBe(false);
  await keys.sync.commit(
    (await keys.sync.collect(() => hlc)).filter(
      (item) => item.id === "2026-W46:me|1",
    ),
  );
  expect(await keys.ownSent("2026-W46")).toBe(true);
  await keys.dropReceived("2026-W45");
  await keys.dropUnsent("2026-W45");
  await keys.dropUnsent("2026-W46");
  expect(await keys.partnerKey("2026-W45:partner", 1)).toBeNull();
  expect(await keys.partnerKey("2026-W46:partner", 1)).not.toBeNull();
  expect(await keys.weeks()).toEqual(["2026-W46"]);
  expect(await keys.ownSent("2026-W46")).toBe(true);
});
