import { describe, expect, it } from "vitest";

import {
  createSingleHead,
  exchange,
  setupHeadPair,
} from "./carrier-test-support";

describe("head split", () => {
  it("is null and empty without a pair (everything is private)", async () => {
    const { head } = createSingleHead();
    await head.add({ title: "Prywatna" });
    expect(await head.split()).toBeNull();
    expect(await head.trend()).toEqual([]);
  });

  it("shows the example of the spec, mirrored on the other phone", async () => {
    const pair = await setupHeadPair();
    const { head } = pair.ua;
    await head.add({ title: "Średnia 1" });
    await head.add({ title: "Średnia 2" });
    await head.add({ title: "Duża", weight: 3, carrier: "partner" });
    await head.add({ title: "Mała", weight: 1, carrier: "both" });
    await head.add({ title: "Prywatna", weight: 3 }, { private: true });
    await exchange(pair);
    expect(await pair.ua.head.split()).toEqual({ me: 56, partner: 44 });
    expect(await pair.ub.head.split()).toEqual({ me: 44, partner: 56 });
  });

  it("stops counting an item once it is done (FR-MNT-06)", async () => {
    const pair = await setupHeadPair();
    const mine = await pair.ua.head.add({ title: "Moja" });
    await pair.ua.head.add({ title: "Jej", carrier: "partner" });
    expect(await pair.ua.head.split()).toEqual({ me: 50, partner: 50 });
    await pair.ua.items.complete(mine.id);
    expect(await pair.ua.head.split()).toEqual({ me: 0, partner: 100 });
  });

  it("is null when nothing is open", async () => {
    const pair = await setupHeadPair();
    const { id } = await pair.ua.head.add({ title: "Moja" });
    await pair.ua.items.complete(id);
    expect(await pair.ua.head.split()).toBeNull();
  });
});
