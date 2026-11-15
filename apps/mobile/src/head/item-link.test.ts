import { describe, expect, it } from "vitest";

import { isItemField, isValidField } from "./item-codec";
import {
  createSingleDevice,
  exchange,
  setupItemPair,
} from "./head-test-support";

describe("the link of a thing to a chore", () => {
  it("knows the field and checks its values", () => {
    expect(isItemField("linkedChoreId")).toBe(true);
    expect(isValidField("linkedChoreId", null)).toBe(true);
    expect(isValidField("linkedChoreId", "chore-1")).toBe(true);
    expect(isValidField("linkedChoreId", "")).toBe(false);
    expect(isValidField("linkedChoreId", 5)).toBe(false);
  });

  it("is null until it is set, and an edit sets it", async () => {
    const { items } = createSingleDevice();
    const { id } = await items.add({ title: "Rzecz" });
    expect(await items.list()).toMatchObject([{ linkedChoreId: null }]);
    await items.edit(id, { linkedChoreId: "chore-1" });
    expect(await items.list()).toMatchObject([{ linkedChoreId: "chore-1" }]);
  });

  it("reaches the partner and is settled per field", async () => {
    const pair = await setupItemPair();
    const { id } = await pair.ia.add({ title: "Rzecz" });
    await exchange(pair);
    await pair.ia.edit(id, { linkedChoreId: "chore-1" });
    await pair.ib.edit(id, { title: "Inna" });
    await exchange(pair);
    for (const list of [await pair.ia.list(), await pair.ib.list()]) {
      expect(list).toMatchObject([{ title: "Inna", linkedChoreId: "chore-1" }]);
    }
  });
});
