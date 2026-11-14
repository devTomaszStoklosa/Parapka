import { expect, it } from "vitest";

import { profile, setup } from "../sync/wiring-test-support";
import { wireCycle, wireCycleHints } from "./wiring";

it("shares one cycle facade per platform", async () => {
  const { platform } = await setup();
  const other = await setup();
  expect(wireCycle(platform)).toBe(wireCycle(platform));
  expect(wireCycle(platform)).not.toBe(wireCycle(other.platform));
});

it("keeps the wellbeing entries in the facade of the platform", async () => {
  const { platform } = await setup();
  const cycle = wireCycle(platform);
  await cycle.saveWellbeing({
    date: cycle.today(),
    energy: 3,
    mood: 3,
    tension: 3,
    tags: [],
  });
  expect(await wireCycle(platform).wellbeingOn(cycle.today())).not.toBeNull();
});

it("makes the hints of the cycle data after the start and a change", async () => {
  const { platform, profiles } = await setup();
  const clock = { nowMs: () => new Date(2026, 10, 8, 12).getTime() };
  const own = { ...platform, clock };
  await profiles.save({ ...profile, cycle: "yes" });
  const { hints } = wireCycleHints(own);
  const first = new Promise<void>((resolve) => {
    const stop = hints.subscribe(() => {
      stop();
      resolve();
    });
  });
  await wireCycle(own).savePeriod({
    id: "p1",
    startDate: "2026-11-01",
    endDate: null,
  });
  await first;
  await wireCycleHints(own).generator.refresh();
  expect(await hints.range("2026-11-08", "2026-11-10")).toHaveLength(3);
});
