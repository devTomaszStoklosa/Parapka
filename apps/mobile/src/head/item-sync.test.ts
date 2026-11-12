import { describe, expect, it } from "vitest";

import { exchange, setupItemPair } from "./head-test-support";

describe("item sync", () => {
  it("passes on an item with its fields to the partner", async () => {
    const pair = await setupItemPair();
    await pair.ia.add({
      title: "Szczepienie",
      category: "health",
      weight: 3,
      dueDate: "2026-12-24",
    });
    await exchange(pair);
    expect(await pair.ib.list()).toEqual([
      {
        id: "device-a-1",
        title: "Szczepienie",
        category: "health",
        weight: 3,
        dueDate: "2026-12-24",
        status: "open",
        doneAt: null,
        shared: true,
      },
    ]);
  });

  it("keeps the title of A and the due date of B changed offline", async () => {
    const pair = await setupItemPair();
    const { id } = await pair.ia.add({ title: "Stary" });
    await exchange(pair);
    await pair.ia.edit(id, { title: "Nowy" });
    await pair.ib.edit(id, { dueDate: "2026-05-01" });
    await exchange(pair);
    await exchange(pair);
    for (const items of [pair.ia, pair.ib]) {
      expect(await items.list()).toMatchObject([
        { title: "Nowy", dueDate: "2026-05-01" },
      ]);
    }
  });

  it("shows the 'done' of B to A with the same moment", async () => {
    const pair = await setupItemPair();
    const { id } = await pair.ia.add({ title: "Rzecz" });
    await exchange(pair);
    pair.ub.time.now = 1_800_000_123_456;
    await pair.ib.complete(id);
    await exchange(pair);
    await exchange(pair);
    for (const items of [pair.ia, pair.ib]) {
      expect(await items.list()).toMatchObject([
        { status: "done", doneAt: 1_800_000_123_456 },
      ]);
    }
  });

  it("skips invalid fields of the partner", async () => {
    const pair = await setupItemPair();
    const { id } = await pair.ia.add({ title: "Rzecz", weight: 1 });
    await exchange(pair);
    const later = "999999999999999-00000-device-a";
    const change = (fields: Record<string, unknown>) => ({
      entity: "MentalLoadItem",
      id,
      op: "upsert" as const,
      fields: Object.fromEntries(
        Object.entries(fields).map(([name, value]) => [
          name,
          { value, hlc: later },
        ]),
      ),
    });
    await pair.ub.handler.apply(change({ weight: 9, carrier: "me" }));
    await pair.ub.handler.apply(change({ title: "Dobry", status: "gone" }));
    expect(await pair.ib.list()).toMatchObject([
      { title: "Dobry", weight: 1, status: "open" },
    ]);
  });
});
