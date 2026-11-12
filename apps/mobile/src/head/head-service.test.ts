import { describe, expect, it } from "vitest";

import { ChoreDeviceError } from "../chores/chore-codec";
import {
  createSingleHead,
  exchange,
  setupHeadPair,
} from "./carrier-test-support";
import { createHeadService } from "./head-service";

describe("head service without a pair", () => {
  it("adds an item carried by me by default", async () => {
    const { head } = createSingleHead();
    expect(await head.add({ title: "Rzecz" })).toMatchObject({
      title: "Rzecz",
      carrier: "me",
      shared: false,
    });
    expect(await head.list()).toMatchObject([{ carrier: "me" }]);
  });

  it("refuses any other carrier than me", async () => {
    const { head } = createSingleHead();
    for (const carrier of ["partner", "both"] as const) {
      await expect(head.add({ title: "Rzecz", carrier })).rejects.toThrow();
    }
    await expect(
      head.add({ title: "Rzecz", carrier: "other" as "me" }),
    ).rejects.toThrow();
    expect(await head.list()).toEqual([]);
  });

  it("lists an item that has no entry as carried by me", async () => {
    const { head, items } = createSingleHead();
    await items.add({ title: "Stara" });
    expect(await head.list()).toMatchObject([{ carrier: "me" }]);
  });

  it("refuses to take over a private item", async () => {
    const { head } = createSingleHead();
    const { id } = await head.add({ title: "Rzecz" });
    await expect(head.takeOver(id)).rejects.toThrow();
  });

  describe("on a device that is not registered yet", () => {
    const withoutDevice = () => {
      const { items, carriers, pairs } = createSingleHead();
      const identity = { deviceId: () => Promise.resolve(null) };
      return {
        items,
        carriers,
        head: createHeadService({
          items,
          carriers,
          pairs,
          identity,
          clock: { nowMs: () => 1 },
        }),
      };
    };

    it("lists and adds a private item carried by me", async () => {
      const { head, carriers } = withoutDevice();
      expect(await head.list()).toEqual([]);
      expect(await head.add({ title: "Rzecz" })).toMatchObject({
        carrier: "me",
      });
      expect(await head.list()).toMatchObject([{ carrier: "me" }]);
      expect(await carriers.list()).toEqual([]);
    });

    it("refuses the partner and both", async () => {
      const { head } = withoutDevice();
      for (const carrier of ["partner", "both"] as const) {
        await expect(head.add({ title: "Rzecz", carrier })).rejects.toThrow();
      }
    });
  });

  it("tells the listeners about a change", async () => {
    const { head } = createSingleHead();
    let calls = 0;
    const stop = head.subscribe(() => {
      calls += 1;
    });
    await head.add({ title: "Rzecz" });
    expect(calls).toBeGreaterThan(0);
    stop();
    const before = calls;
    await head.add({ title: "Druga" });
    expect(calls).toBe(before);
  });
});

describe("head service in a pair", () => {
  it("refuses a partner whose device is not known yet", async () => {
    const pair = await setupHeadPair();
    await expect(
      pair.ub.head.add({ title: "Rzecz", carrier: "partner" }),
    ).rejects.toThrow();
  });

  it("needs the device of this phone for a shared item", async () => {
    const pair = await setupHeadPair();
    const { items, carriers } = pair.ua;
    const pairs = pair.a.pairs;
    const identity = { deviceId: () => Promise.resolve(null) };
    const head = createHeadService({
      items,
      carriers,
      pairs,
      identity,
      clock: { nowMs: () => 1 },
    });
    await expect(head.add({ title: "Rzecz" })).rejects.toThrow(
      ChoreDeviceError,
    );
  });

  it("refuses a carrier other than me for a private item", async () => {
    const pair = await setupHeadPair();
    for (const carrier of ["partner", "both"] as const) {
      await expect(
        pair.ua.head.add({ title: "Rzecz", carrier }, { private: true }),
      ).rejects.toThrow();
    }
  });

  it("takes over only an open item that the partner or both carry", async () => {
    const pair = await setupHeadPair();
    const { id } = await pair.ua.head.add({ title: "Rzecz" });
    await expect(pair.ua.head.takeOver(id)).rejects.toThrow();
    await expect(pair.ua.head.takeOver("unknown")).rejects.toThrow();
    await exchange(pair);
    await pair.ub.items.complete(id);
    await expect(pair.ub.head.takeOver(id)).rejects.toThrow();
  });

  it("refuses to take over an item that has no entry yet", async () => {
    const pair = await setupHeadPair();
    const { id } = await pair.ua.items.add({ title: "Rzecz" });
    await exchange(pair);
    expect(await pair.ub.head.list()).toMatchObject([{ id, carrier: null }]);
    await expect(pair.ub.head.takeOver(id)).rejects.toThrow();
  });

  it("makes the taker the carrier at once", async () => {
    const pair = await setupHeadPair();
    const { id } = await pair.ua.head.add({ title: "Rzecz", carrier: "both" });
    await exchange(pair);
    pair.ub.time.now += 1000;
    await pair.ub.head.takeOver(id);
    expect(await pair.ub.head.list()).toMatchObject([{ carrier: "me" }]);
  });
});
