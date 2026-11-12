import { describe, expect, it, vi } from "vitest";

import { createHandoverService } from "./handover-service";
import {
  createSingleHead,
  exchange,
  setupHeadPair,
} from "./carrier-test-support";

async function pairWithItem(options?: {
  private?: boolean;
  carrier?: "partner";
}) {
  const pair = await setupHeadPair();
  const { id } = await pair.ua.head.add(
    { title: "Rzecz", carrier: options?.carrier },
    options?.private ? { private: true } : undefined,
  );
  return { pair, id };
}

describe("handover service", () => {
  it("refuses a request without a pair", async () => {
    const solo = createSingleHead();
    const { id } = await solo.head.add({ title: "Rzecz" });
    await expect(solo.handover.requestHandover(id)).rejects.toThrow(
      "no partner",
    );
  });

  it("refuses a private, unknown, done or foreign item", async () => {
    const { pair, id } = await pairWithItem({ private: true });
    await expect(pair.ua.handover.requestHandover(id)).rejects.toThrow();
    await expect(pair.ua.handover.requestHandover("nope")).rejects.toThrow(
      "unknown",
    );
    const other = await pair.ua.head.add({ title: "Druga" });
    await pair.ua.items.complete(other.id);
    await expect(pair.ua.handover.requestHandover(other.id)).rejects.toThrow();
    const theirs = await pair.ua.head.add({ title: "B", carrier: "partner" });
    await expect(pair.ua.handover.requestHandover(theirs.id)).rejects.toThrow();
  });

  it("refuses to answer an unknown or own request", async () => {
    const { pair, id } = await pairWithItem();
    const requestId = await pair.ua.handover.requestHandover(id);
    await expect(pair.ua.handover.acceptHandover(requestId)).rejects.toThrow();
    await expect(pair.ua.handover.declineHandover(requestId)).rejects.toThrow();
    await expect(pair.ua.handover.declineHandover("nope")).rejects.toThrow();
  });

  it("refuses to answer a request twice", async () => {
    const pair = await setupHeadPair();
    const { id } = await pair.ua.head.add({ title: "Rzecz" });
    await exchange(pair);
    const requestId = await pair.ua.handover.requestHandover(id);
    await exchange(pair);
    await pair.ub.handover.declineHandover(requestId);
    await expect(pair.ub.handover.acceptHandover(requestId)).rejects.toThrow();
  });

  it("needs the device of this phone", async () => {
    const solo = createSingleHead();
    const service = createHandoverService({
      ...solo,
      identity: { deviceId: () => Promise.resolve(null) },
      newId: () => "r",
    });
    await expect(service.requestHandover("x")).rejects.toThrow();
  });

  it("tells the listeners about changes and stops", async () => {
    const { pair, id } = await pairWithItem();
    const listener = vi.fn();
    const stop = pair.ua.handover.subscribe(listener);
    await pair.ua.handover.requestHandover(id);
    expect(listener).toHaveBeenCalled();
    stop();
    listener.mockClear();
    await pair.ua.head.add({ title: "Inna" });
    expect(listener).not.toHaveBeenCalled();
  });
});
