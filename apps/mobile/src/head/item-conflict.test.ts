import { describe, expect, it } from "vitest";

import { exchange, setupItemPair } from "./head-test-support";

async function shared() {
  const pair = await setupItemPair();
  const { id } = await pair.ia.add({ title: "Rzecz" });
  await exchange(pair);
  return { pair, id };
}

describe("item conflicts", () => {
  it("lets a deletion win over an edit made at the same time", async () => {
    const { pair, id } = await shared();
    await pair.ia.remove(id);
    await pair.ib.edit(id, { title: "Edytowana" });
    await exchange(pair);
    await exchange(pair);
    expect(await pair.ia.list()).toEqual([]);
    expect(await pair.ib.list()).toEqual([]);
  });

  it("brings an item back with a later restore", async () => {
    const { pair, id } = await shared();
    await pair.ib.remove(id);
    await exchange(pair);
    expect(await pair.ia.list()).toEqual([]);
    await pair.ia.restore(id);
    await exchange(pair);
    await exchange(pair);
    expect(await pair.ia.list()).toHaveLength(1);
    expect(await pair.ib.list()).toHaveLength(1);
  });
});
