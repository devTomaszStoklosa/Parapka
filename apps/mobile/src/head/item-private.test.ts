import { describe, expect, it } from "vitest";

import {
  createSingleDevice,
  exchange,
  setupItemPair,
} from "./head-test-support";

describe("a private item", () => {
  it("is private without a pair, asked for or not", async () => {
    const { items } = createSingleDevice();
    expect((await items.add({ title: "A" })).shared).toBe(false);
    const asked = await items.add({ title: "B" }, { private: false });
    expect(asked.shared).toBe(false);
  });

  it("stays on this device in a pair", async () => {
    const pair = await setupItemPair();
    const own = await pair.ia.add({ title: "Moja" }, { private: true });
    await pair.ia.add({ title: "Wspólna" });
    expect(own.shared).toBe(false);
    await exchange(pair);
    expect((await pair.ia.list()).map((item) => item.title)).toEqual([
      "Moja",
      "Wspólna",
    ]);
    expect((await pair.ib.list()).map((item) => item.title)).toEqual([
      "Wspólna",
    ]);
  });

  it("is not overwritten by the partner", async () => {
    const pair = await setupItemPair();
    const { id } = await pair.ia.add({ title: "Wspólna" });
    await exchange(pair);
    await pair.ub.handler.disconnected?.();
    await pair.ia.edit(id, { title: "Zmieniona" });
    await exchange(pair);
    expect(await pair.ib.list()).toMatchObject([
      { title: "Wspólna", shared: false },
    ]);
  });

  it("is not sent while SHARED_MENTAL_LOAD is off, and then everything is", async () => {
    let shared = false;
    const pair = await setupItemPair(() => shared);
    await pair.ia.add({ title: "Rzecz" });
    await exchange(pair);
    expect(await pair.ib.list()).toEqual([]);
    shared = true;
    await exchange(pair);
    expect(await pair.ib.list()).toHaveLength(1);
  });

  it("keeps the copies as private after the pair ends", async () => {
    const pair = await setupItemPair();
    const { id } = await pair.ia.add({ title: "Rzecz" });
    await exchange(pair);
    await pair.ua.handler.disconnected?.();
    await pair.ia.edit(id, { title: "Tylko moja" });
    await exchange(pair);
    expect(await pair.ia.list()).toMatchObject([
      { title: "Tylko moja", shared: false },
    ]);
    expect(await pair.ib.list()).toMatchObject([{ title: "Rzecz" }]);
  });
});
