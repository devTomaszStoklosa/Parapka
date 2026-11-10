import { expect, it } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import type { Platform } from "../platform/context";
import { wireConsent } from "./wiring";

it("builds repositories over the platform database and clock", async () => {
  const platform = {
    database: createMemoryDatabase(),
    clock: { nowMs: () => 5 },
  } as unknown as Platform;
  const { consent, profiles } = wireConsent(platform);
  expect(await consent.current()).toBeNull();
  expect(await profiles.get()).toBeNull();
});
