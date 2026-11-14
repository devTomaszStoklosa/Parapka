import { expect, it } from "vitest";

import { setup } from "../sync/wiring-test-support";
import { wireCycle } from "./wiring";

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
