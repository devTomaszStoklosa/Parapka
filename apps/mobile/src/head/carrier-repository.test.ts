import type { ContentChange } from "@parapka/protocol";
import { createHlc, formatHlc } from "@parapka/sync";
import { describe, expect, it } from "vitest";

import { ChoreDeviceError } from "../chores/chore-codec";
import { createMemoryDatabase } from "../data/memory-database";
import { createCarrierRepository } from "./carrier-repository";

const AT = formatHlc(createHlc(1_800_000_000_000, 0, "device-b"));

function setup(deviceId: string | null = "device-a") {
  const database = createMemoryDatabase();
  const time = { now: 1_800_000_000_000 };
  const carriers = createCarrierRepository({
    database,
    identity: { deviceId: () => Promise.resolve(deviceId) },
    clock: { nowMs: () => time.now },
  });
  return { carriers, time };
}

const entry = (changedAt: string, itemId = "item-1") => ({
  itemId,
  carrier: "both",
  changedBy: "device-b",
  changedAt,
});

const upsert = (id: string, values: Record<string, unknown>) =>
  ({
    entity: "CarrierChange",
    id,
    op: "upsert",
    fields: Object.fromEntries(
      Object.entries(values).map(([name, value]) => [name, { value, hlc: AT }]),
    ),
  }) as ContentChange;

describe("carrier repository", () => {
  it("adds an entry with the device and the HLC of the moment", async () => {
    const { carriers } = setup();
    await carriers.append({ itemId: "item-1", carrier: "both", shared: true });
    const [first, ...rest] = await carriers.list();
    expect(rest).toEqual([]);
    expect(first).toMatchObject({
      itemId: "item-1",
      carrier: "both",
      changedBy: "device-a",
    });
    expect(first?.changedAt).toContain("device-a");
  });

  it("keeps every entry, ordered by item and moment", async () => {
    const { carriers, time } = setup();
    await carriers.append({ itemId: "item-2", carrier: "both", shared: true });
    await carriers.append({ itemId: "item-1", carrier: "both", shared: true });
    time.now += 1;
    await carriers.append({
      itemId: "item-1",
      carrier: "device-a",
      shared: true,
    });
    expect((await carriers.list()).map((e) => [e.itemId, e.carrier])).toEqual([
      ["item-1", "both"],
      ["item-1", "device-a"],
      ["item-2", "both"],
    ]);
  });

  it("lists the entries in the same order every time", async () => {
    const { carriers, time } = setup();
    for (const itemId of ["item-2", "item-1", "item-2", "item-1"]) {
      time.now += 1;
      await carriers.append({ itemId, carrier: "both", shared: true });
    }
    const first = await carriers.list();
    expect(await carriers.list()).toEqual(first);
    expect(first.map((e) => e.itemId)).toEqual([
      "item-1",
      "item-1",
      "item-2",
      "item-2",
    ]);
    expect(first[0]?.changedAt < (first[1]?.changedAt ?? "")).toBe(true);
  });

  it("refuses an empty item or carrier", async () => {
    const { carriers } = setup();
    for (const change of [
      { itemId: "", carrier: "both" },
      { itemId: "item-1", carrier: "" },
    ]) {
      await expect(
        carriers.append({ ...change, shared: true }),
      ).rejects.toThrow();
    }
  });

  it("needs the device of this phone", async () => {
    const { carriers } = setup(null);
    await expect(
      carriers.append({ itemId: "item-1", carrier: "both", shared: true }),
    ).rejects.toThrow(ChoreDeviceError);
  });

  it("moves an entry into the state once it was sent", async () => {
    const { carriers } = setup();
    await carriers.append({ itemId: "item-1", carrier: "both", shared: true });
    const sent = await carriers.sync.collect(() => AT);
    expect(sent).toHaveLength(1);
    await carriers.sync.commit(sent);
    expect(await carriers.sync.collect(() => AT)).toEqual([]);
    expect(await carriers.list()).toHaveLength(1);
  });

  it("takes in an entry of the partner", async () => {
    const { carriers } = setup();
    const id = `item-1|${AT}`;
    await carriers.sync.merge(upsert(id, entry(AT)));
    expect(await carriers.list()).toEqual([entry(AT)]);
  });

  it("skips what is not a whole, valid entry", async () => {
    const { carriers } = setup();
    const id = `item-1|${AT}`;
    await carriers.sync.merge(upsert(id, entry("not an HLC")));
    await carriers.sync.merge(upsert(id, { ...entry(AT), carrier: 5 }));
    await carriers.sync.merge(upsert(id, { itemId: "item-1", changedAt: AT }));
    await carriers.sync.merge(upsert("other-id", entry(AT)));
    await carriers.sync.merge({
      entity: "CarrierChange",
      id,
      op: "delete",
      hlc: AT,
    });
    expect(await carriers.list()).toEqual([]);
  });

  it("does not overwrite an entry that is private here", async () => {
    const { carriers } = setup();
    await carriers.append({ itemId: "item-1", carrier: "both", shared: true });
    await carriers.sync.makePrivate();
    await carriers.sync.makePrivate();
    expect(await carriers.sync.collect(() => AT)).toEqual([]);
    const changedAt = (await carriers.list())[0]?.changedAt ?? "";
    await carriers.sync.merge(
      upsert(`item-1|${changedAt}`, { ...entry(changedAt), carrier: "x" }),
    );
    expect(await carriers.list()).toMatchObject([{ carrier: "both" }]);
  });
});
