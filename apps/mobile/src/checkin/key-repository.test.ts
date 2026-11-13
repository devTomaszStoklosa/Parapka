import type { ContentChange } from "@parapka/protocol";
import { expect, it } from "vitest";

import type { Pair } from "../pairing/pair-repository";
import { createMemoryDatabase } from "../data/memory-database";
import { base64Encode } from "../sync/base64";
import { parseKey } from "./key-codec";
import { createKeyRepository } from "./key-repository";

const KEY = base64Encode(new Uint8Array(32).fill(7));
const hlc = "000000000000001-00000-partner";

const change = (
  fields: Record<string, unknown>,
  id = "2026-W45:partner|1",
): ContentChange => ({
  entity: "CheckInKey",
  id,
  op: "upsert",
  fields: Object.fromEntries(
    Object.entries(fields).map(([name, value]) => [name, { value, hlc }]),
  ),
});

const good = { checkinId: "2026-W45:partner", version: 1, key: KEY };

function setup(partnerId: string | null = "partner") {
  const database = createMemoryDatabase();
  const keys = createKeyRepository({
    database,
    pairs: {
      activePair: () =>
        Promise.resolve(
          partnerId === null ? null : ({ deviceId: partnerId } as Pair),
        ),
    },
  });
  return { keys, database };
}

it("parses the key of the partner and rejects the invalid ones", () => {
  expect(parseKey(change(good), "partner")).toMatchObject({
    own: false,
    key: KEY,
  });
  const bad = [
    change({ ...good, key: "short" }),
    change({ ...good, key: 5 }),
    change({ ...good, key: "not base64!" }),
    change({ ...good, version: 0 }),
    change({ ...good, version: "1" }),
    change({ ...good, checkinId: 1 }),
    change({ ...good, checkinId: "partner" }),
    change(good, "other|1"),
    change({ checkinId: good.checkinId, version: 1 }),
    { entity: "CheckInKey", id: "x", op: "delete", hlc } as ContentChange,
  ];
  for (const item of bad) expect(parseKey(item, "partner")).toBeNull();
  expect(parseKey(change(good), "me")).toBeNull();
});

it("queues an own key once, sends it once and keeps it when forgetting", async () => {
  const { keys } = setup();
  await keys.addOwn("2026-W45:me", 1, KEY);
  await keys.addOwn("2026-W45:me", 1, KEY);
  const sent = await keys.sync.collect(() => hlc);
  expect(sent.map((item) => item.id)).toEqual(["2026-W45:me|1"]);
  await keys.sync.commit(sent);
  expect(await keys.sync.collect(() => hlc)).toEqual([]);
  await keys.forgetReceived();
  await keys.sync.makePrivate();
  await keys.addOwn("2026-W45:me", 1, KEY);
  expect(await keys.sync.collect(() => hlc)).toEqual([]);
});

it("keeps the key of each version of the partner, and forgets it", async () => {
  const { keys } = setup();
  await keys.sync.merge(change(good));
  await keys.sync.merge(change({ ...good, version: 2 }, "2026-W45:partner|2"));
  await keys.sync.merge(change(good));
  await keys.sync.merge(change({ ...good, checkinId: "x" }));
  expect((await keys.partnerKey("2026-W45:partner", 1))?.version).toBe(1);
  expect((await keys.partnerKey("2026-W45:partner", 2))?.version).toBe(2);
  await keys.forgetReceived();
  expect(await keys.partnerKey("2026-W45:partner", 1)).toBeNull();
});
