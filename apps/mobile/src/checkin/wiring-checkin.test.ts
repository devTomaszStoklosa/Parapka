import { afterEach, expect, it, vi } from "vitest";

import { defaultConsent } from "../consent/consent-model";
import {
  profile,
  setup,
  start,
  stoppers,
  tick,
} from "../sync/wiring-test-support";
import { wireCheckin } from "./wiring";

afterEach(() => {
  for (const stop of stoppers.splice(0)) stop();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("shares one repository per platform", async () => {
  const { platform } = await setup();
  expect(wireCheckin(platform)).toBe(wireCheckin(platform));
  expect(wireCheckin(platform).checkin).toBeDefined();
});

it("synchronizes after each change of the schedule", async () => {
  const set = await setup();
  await set.consent.save(defaultConsent(profile));
  await set.pair();
  start(set.controller);
  await vi.waitFor(() => {
    expect(set.syncs()).toBeGreaterThan(0);
  });
  await tick();
  const before = set.syncs();
  await wireCheckin(set.platform).schedule.set({
    weekday: 3,
    hour: 19,
    minute: 0,
  });
  await vi.waitFor(
    () => {
      expect(set.syncs()).toBeGreaterThan(before);
    },
    { timeout: 3000 },
  );
});
