import { DEFAULT_CHECKIN_SCHEDULE, type Clock } from "@parapka/domain";
import type { ContentChange } from "@parapka/protocol";
import { expect, it } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import type { Pair } from "../pairing/pair-repository";
import { base64Encode } from "../sync/base64";
import { createKeyRepository } from "./key-repository";
import { REVEALED_COLLECTION } from "./reveal";
import { createCheckinKeyHandler } from "./wiring";
import { createWindowEnd, weekOfChange } from "./window-sweep";

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

const at = (local: string) => new Date(local).getTime();

/** A window end over real keys, a fake sealed store and a clock to move. */
function windowEnd() {
  const database = createMemoryDatabase();
  const keys = createKeyRepository({
    database,
    pairs: {
      activePair: () =>
        Promise.resolve({ deviceId: "partner" } as unknown as Pair),
    },
  });
  const sealedWeeks = new Set(["2026-W45", "2026-W46"]);
  const dropped: string[] = [];
  let now = at("2026-11-12T12:00");
  const clock: Clock = { nowMs: () => now };
  const end = createWindowEnd({
    clock,
    schedule: { get: () => Promise.resolve(DEFAULT_CHECKIN_SCHEDULE) },
    database,
    keys,
    sealed: {
      weeks: () => Promise.resolve([...sealedWeeks]),
      dropReceived: (week) => {
        dropped.push(week);
        return Promise.resolve();
      },
    },
  });
  return {
    end,
    keys,
    database,
    dropped,
    moveTo: (local: string) => {
      now = at(local);
    },
  };
}

const sendOwn = async (
  keys: ReturnType<typeof createKeyRepository>,
  id: string,
) =>
  keys.sync.commit(
    (await keys.sync.collect(() => hlc)).filter((item) => item.id === id),
  );

it("is not closed for the current week, a revealed week or a sent key", async () => {
  const { end, keys, database, moveTo } = windowEnd();
  expect(await end.closed("2026-W45")).toBe(false);
  moveTo("2026-11-15T19:00");
  expect(await end.closed("2026-W46")).toBe(false);
  expect(await end.closed("2026-W45")).toBe(true);
  await database.put(REVEALED_COLLECTION, "2026-W45", {});
  expect(await end.closed("2026-W45")).toBe(false);
  await database.delete(REVEALED_COLLECTION, "2026-W45");
  await keys.addOwn("2026-W45:me", 1, KEY);
  await sendOwn(keys, "2026-W45:me|1");
  expect(await end.closed("2026-W45")).toBe(false);
});

it("keeps a revealed week whose own key is not sent", async () => {
  const { end, keys, database, dropped, moveTo } = windowEnd();
  await keys.addOwn("2026-W45:me", 1, KEY);
  await keys.sync.merge(received("2026-W45:partner"));
  await database.put(REVEALED_COLLECTION, "2026-W45", {});
  moveTo("2026-11-15T19:00");
  await end.sweep();
  expect(dropped).toEqual([]);
  expect(await keys.partnerKey("2026-W45:partner", 1)).not.toBeNull();
  expect((await keys.sync.collect(() => hlc)).map((i) => i.id)).toEqual([
    "2026-W45:me|1",
  ]);
});

it("drops the queued own key and the data of the partner of a closed week", async () => {
  const { end, keys, dropped, moveTo } = windowEnd();
  await keys.addOwn("2026-W45:me", 1, KEY);
  await keys.sync.merge(received("2026-W45:partner"));
  moveTo("2026-11-15T19:00");
  await end.sweep();
  expect(dropped).toEqual(["2026-W45"]);
  expect(await keys.partnerKey("2026-W45:partner", 1)).toBeNull();
  expect(await keys.sync.collect(() => hlc)).toEqual([]);
});

it("drops the data of the partner 7 days after the end of the window when the key of the partner did not come", async () => {
  const { end, keys, dropped, moveTo } = windowEnd();
  await keys.addOwn("2026-W45:me", 1, KEY);
  await sendOwn(keys, "2026-W45:me|1");
  await keys.sync.merge(received("2026-W45:partner"));
  moveTo("2026-11-22T18:59");
  await end.sweep();
  expect(dropped).not.toContain("2026-W45");
  expect(await keys.partnerKey("2026-W45:partner", 1)).not.toBeNull();
  moveTo("2026-11-22T19:00");
  await end.sweep();
  expect(dropped).toContain("2026-W45");
  expect(await keys.partnerKey("2026-W45:partner", 1)).toBeNull();
  expect(await keys.ownSent("2026-W45")).toBe(true);
});

it("sweeps only locally and keeps a revealed week after 7 days", async () => {
  const { end, keys, database, dropped, moveTo } = windowEnd();
  await keys.addOwn("2026-W45:me", 1, KEY);
  await sendOwn(keys, "2026-W45:me|1");
  await keys.sync.merge(received("2026-W45:partner"));
  const before = await keys.sync.collect(() => hlc);
  moveTo("2026-11-22T19:00");
  await database.put(REVEALED_COLLECTION, "2026-W45", {});
  await end.sweep();
  expect(dropped).not.toContain("2026-W45");
  expect(await keys.partnerKey("2026-W45:partner", 1)).not.toBeNull();
  await database.delete(REVEALED_COLLECTION, "2026-W45");
  await end.sweep();
  expect(await keys.sync.collect(() => hlc)).toEqual(before);
});

it("rejects the late key of the partner after 7 days", async () => {
  const { end, keys, moveTo } = windowEnd();
  const handler = createCheckinKeyHandler({
    keys,
    reveal: { settle: async () => {}, forgetReceived: async () => {} },
    windowEnd: end,
  });
  await keys.addOwn("2026-W45:me", 1, KEY);
  await sendOwn(keys, "2026-W45:me|1");
  moveTo("2026-11-22T18:59");
  await handler.apply(received("2026-W45:partner"));
  expect(await keys.partnerKey("2026-W45:partner", 1)).not.toBeNull();
  await keys.dropReceived("2026-W45");
  moveTo("2026-11-22T19:00");
  await handler.apply(received("2026-W45:partner"));
  expect(await keys.partnerKey("2026-W45:partner", 1)).toBeNull();
});
