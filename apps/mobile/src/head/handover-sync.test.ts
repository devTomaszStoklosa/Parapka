import { describe, expect, it } from "vitest";

import { exchange, setupHeadPair } from "./carrier-test-support";

type Pair = Awaited<ReturnType<typeof setupHeadPair>>;

const carriers = async (pair: Pair, side: "ua" | "ub") =>
  (await pair[side].head.list()).map(({ carrier }) => carrier);

const counts = async (pair: Pair, side: "ua" | "ub") => [
  (await pair[side].handover.incoming()).length,
  (await pair[side].handover.outgoing()).length,
];

/** An item of A carried by A, and A's request for it, on both devices. */
async function requested(carrier?: "me" | "both") {
  const pair = await setupHeadPair();
  const { id } = await pair.ua.head.add({ title: "Szczepienie", carrier });
  await exchange(pair);
  pair.ub.time.now += 1000;
  const requestId = await pair.ua.handover.requestHandover(id);
  await exchange(pair);
  return { pair, id, requestId };
}

describe("handover sync (FR-MNT-03)", () => {
  it("shows the request to B and keeps it with A", async () => {
    const { pair, id, requestId } = await requested();
    expect(await counts(pair, "ua")).toEqual([0, 1]);
    expect(await counts(pair, "ub")).toEqual([1, 0]);
    const [view] = await pair.ub.handover.incoming();
    expect(view).toMatchObject({ requestId, item: { id } });
  });

  it("changes nothing but the request when B declines", async () => {
    const { pair, requestId } = await requested();
    await pair.ub.handover.declineHandover(requestId);
    await exchange(pair);
    await exchange(pair);
    expect(await counts(pair, "ua")).toEqual([0, 0]);
    expect(await counts(pair, "ub")).toEqual([0, 0]);
    expect(await carriers(pair, "ua")).toEqual(["me"]);
    expect(await carriers(pair, "ub")).toEqual(["partner"]);
    expect(await pair.ua.carriers.list()).toHaveLength(1);
  });

  it("makes B the carrier on both phones when B accepts", async () => {
    const { pair, requestId } = await requested();
    await pair.ub.handover.acceptHandover(requestId);
    await exchange(pair);
    await exchange(pair);
    expect(await carriers(pair, "ua")).toEqual(["partner"]);
    expect(await carriers(pair, "ub")).toEqual(["me"]);
    expect(await counts(pair, "ua")).toEqual([0, 0]);
    expect(await counts(pair, "ub")).toEqual([0, 0]);
  });

  it("lets B take over an item of both", async () => {
    const { pair, requestId } = await requested("both");
    await pair.ub.handover.acceptHandover(requestId);
    await exchange(pair);
    expect(await carriers(pair, "ua")).toEqual(["partner"]);
  });

  it("does not create a second request for the item", async () => {
    const { pair, id } = await requested();
    await expect(pair.ua.handover.requestHandover(id)).rejects.toThrow();
    await expect(pair.ub.handover.requestHandover(id)).rejects.toThrow();
    expect(await pair.ua.handovers.list()).toHaveLength(1);
  });

  it("lets A ask again after a refusal", async () => {
    const { pair, id, requestId } = await requested();
    await pair.ub.handover.declineHandover(requestId);
    await exchange(pair);
    pair.ua.time.now += 1000;
    await pair.ua.handover.requestHandover(id);
    expect(await counts(pair, "ua")).toEqual([0, 1]);
  });

  it("hides the request once the item is done or removed", async () => {
    const { pair, id } = await requested();
    await pair.ua.items.complete(id);
    await exchange(pair);
    expect(await counts(pair, "ua")).toEqual([0, 0]);
    expect(await counts(pair, "ub")).toEqual([0, 0]);
  });

  it("does not send a request of a private item", async () => {
    const pair = await setupHeadPair();
    await pair.ua.head.add({ title: "Prywatna" }, { private: true });
    await exchange(pair);
    await pair.ua.handovers.append({
      requestId: "r",
      itemId: "x",
      requestedBy: "a",
      status: "pending",
      shared: false,
    });
    await exchange(pair);
    expect(await pair.ub.handovers.list()).toEqual([]);
  });

  it("makes the requests private when the pair ends", async () => {
    const { pair } = await requested();
    await pair.ub.handoverHandler.disconnected?.();
    expect(await pair.ub.handovers.sync.collect(() => "x")).toEqual([]);
  });
});
