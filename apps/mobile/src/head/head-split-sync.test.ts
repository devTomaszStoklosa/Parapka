import { describe, expect, it } from "vitest";

import { exchange, setupHeadPair } from "./carrier-test-support";
import { isoWeek } from "./split-model";

const local = (y: number, m: number, d: number, h: number) =>
  new Date(y, m - 1, d, h).getTime();

describe("head trend on two devices (FR-MNT-05)", () => {
  it("shows the same week on both phones, with a takeover made offline on Sunday", async () => {
    const pair = await setupHeadPair();
    const { ua, ub } = pair;
    ua.time.now = local(2026, 3, 4, 10);
    ub.time.now = ua.time.now;
    const { id } = await ua.head.add({ title: "Szczepienie" });
    await ua.head.add({ title: "Rachunki", carrier: "partner" });
    await exchange(pair);

    // B takes the item on Sunday, before the end of the week, without a network.
    ub.time.now = local(2026, 3, 8, 21);
    await ub.head.takeOver(id);

    // The phones meet two days later.
    ua.time.now = local(2026, 3, 10, 9);
    ub.time.now = ua.time.now;
    await exchange(pair);
    await exchange(pair);

    const week = isoWeek(local(2026, 3, 8, 12));
    const onA = (await ua.head.trend()).find((s) => s.week === week);
    const onB = (await ub.head.trend()).find((s) => s.week === week);
    expect(onA?.split).toEqual({ me: 0, partner: 100 });
    expect(onB?.split).toEqual({ me: 100, partner: 0 });
    expect(onA?.split?.me).toBe(onB?.split?.partner);
  });
});
