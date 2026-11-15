import { describe, expect, it } from "vitest";

import { exchange, seedPrivate, setupSharePair } from "./share-sync-support";

describe("handing private records over", () => {
  it("sends the picked chore and thing, with their check-off and carrier", async () => {
    const pair = await setupSharePair();
    const { choreId, itemId } = await seedPrivate(pair.ua);
    await pair.ua.service.share([choreId], [itemId]);
    await exchange(pair);
    expect(await pair.ub.chores.list()).toMatchObject([
      { title: "Podlać kwiaty", assignment: { kind: "person", person: "partner" } },
    ]);
    expect(await pair.ub.completions.list()).toMatchObject([
      { choreId, occurrenceDate: "2026-11-10", completedBy: "device-a" },
    ]);
    expect(await pair.ub.head.list()).toMatchObject([
      { title: "Umówić wizytę", carrier: "partner" },
    ]);
    expect(await pair.ua.chores.list()).toMatchObject([{ shared: true }]);
  });

  it("keeps what was not picked private and sends nothing of it", async () => {
    const pair = await setupSharePair();
    const { itemId } = await seedPrivate(pair.ua);
    await pair.ua.service.share([], [itemId]);
    await exchange(pair);
    expect(await pair.ub.chores.list()).toEqual([]);
    expect(await pair.ub.completions.list()).toEqual([]);
    expect(await pair.ub.head.list()).toHaveLength(1);
    expect(await pair.ua.chores.list()).toMatchObject([{ shared: false }]);
    expect(new Set(pair.ua.sent)).toEqual(
      new Set(["MentalLoadItem", "CarrierChange"]),
    );
  });

  it("sends nothing and changes nothing when the person skips", async () => {
    const pair = await setupSharePair();
    await seedPrivate(pair.ua);
    const before = {
      chores: await pair.a.database.list("chores"),
      items: await pair.a.database.list("mental-load-items"),
      completions: await pair.a.database.list("chore-completions"),
      carriers: await pair.a.database.list("carrier-changes"),
    };
    await pair.ua.service.skip();
    await exchange(pair);
    expect(pair.ua.sent).toEqual([]);
    expect(await pair.a.database.list("chores")).toEqual(before.chores);
    expect(await pair.a.database.list("mental-load-items")).toEqual(
      before.items,
    );
    expect(await pair.a.database.list("chore-completions")).toEqual(
      before.completions,
    );
    expect(await pair.a.database.list("carrier-changes")).toEqual(
      before.carriers,
    );
    expect(await pair.ub.chores.list()).toEqual([]);
    expect(await pair.ub.head.list()).toEqual([]);
  });

  it("never sends the cycle, check-in or hints", async () => {
    const pair = await setupSharePair();
    const { choreId, itemId } = await seedPrivate(pair.ua);
    await pair.ua.service.share([choreId], [itemId]);
    await exchange(pair);
    expect(
      [...new Set(pair.ua.sent)].every((entity) =>
        ["Chore", "ChoreCompletion", "MentalLoadItem", "CarrierChange"].includes(
          entity,
        ),
      ),
    ).toBe(true);
    expect(pair.ua.sent.length).toBeGreaterThan(0);
  });
});
