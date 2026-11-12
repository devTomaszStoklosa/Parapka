import { describe, expect, it } from "vitest";

import { exchange, setupHeadPair } from "./carrier-test-support";

const carriers = async (
  pair: Awaited<ReturnType<typeof setupHeadPair>>,
  side: "ua" | "ub",
) => (await pair[side].head.list()).map(({ carrier }) => carrier);

/** An item of A carried by A, on both devices. */
async function shared(isShared?: () => boolean, carrier?: "me" | "both") {
  const pair = await setupHeadPair(isShared);
  const { id } = await pair.ua.head.add({ title: "Szczepienie", carrier });
  await exchange(pair);
  return { pair, id };
}

describe("carrier sync", () => {
  it("shows both the new carrier after B takes the item (FR-MNT-02)", async () => {
    const { pair, id } = await shared();
    expect(await carriers(pair, "ub")).toEqual(["partner"]);
    await pair.ub.head.takeOver(id);
    await exchange(pair);
    expect(await carriers(pair, "ua")).toEqual(["partner"]);
    expect(await carriers(pair, "ub")).toEqual(["me"]);
  });

  it("keeps the later of two takeovers made offline on both phones", async () => {
    const { pair, id } = await shared(undefined, "both");
    pair.ua.time.now = 1_800_000_005_000;
    pair.ub.time.now = 1_800_000_001_000;
    await pair.ua.head.takeOver(id);
    await pair.ub.head.takeOver(id);
    await exchange(pair);
    await exchange(pair);
    expect(await carriers(pair, "ua")).toEqual(["me"]);
    expect(await carriers(pair, "ub")).toEqual(["partner"]);
  });

  it("shows an item of both as 'both' to the partner", async () => {
    const { pair } = await shared(undefined, "both");
    expect(await carriers(pair, "ua")).toEqual(["both"]);
    expect(await carriers(pair, "ub")).toEqual(["both"]);
  });

  it("shows B the item that A gave to B", async () => {
    const pair = await setupHeadPair();
    await pair.ua.head.add({ title: "Rzecz", carrier: "partner" });
    await exchange(pair);
    expect(await carriers(pair, "ub")).toEqual(["me"]);
  });

  it("does not send the entries of a private item", async () => {
    const pair = await setupHeadPair();
    await pair.ua.head.add({ title: "Prywatna" }, { private: true });
    await exchange(pair);
    expect(await pair.ub.head.list()).toEqual([]);
    expect(await pair.ub.carriers.list()).toEqual([]);
  });

  it("does not send the entries after the pair ended", async () => {
    const pair = await setupHeadPair();
    await pair.ua.head.add({ title: "Rzecz" });
    await pair.ua.carrierHandler.disconnected?.();
    await exchange(pair);
    expect(await pair.ub.carriers.list()).toEqual([]);
    expect(await pair.ua.carriers.list()).toHaveLength(1);
  });

  it("sends nothing while SHARED_MENTAL_LOAD is off, and then everything", async () => {
    let on = true;
    const { pair, id } = await shared(() => on);
    on = false;
    await pair.ub.head.takeOver(id);
    await exchange(pair);
    expect(await carriers(pair, "ua")).toEqual(["me"]);
    on = true;
    await exchange(pair);
    expect(await carriers(pair, "ua")).toEqual(["partner"]);
  });
});
