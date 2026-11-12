import { afterEach, expect, it, vi } from "vitest";

import { defaultConsent } from "../consent/consent-model";
import {
  profile,
  setup,
  start,
  stoppers,
  tick,
} from "../sync/wiring-test-support";
import { wireHead } from "./wiring";

afterEach(() => {
  for (const stop of stoppers.splice(0)) stop();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("shares one repository per platform", async () => {
  const { platform } = await setup();
  expect(wireHead(platform)).toBe(wireHead(platform));
});

it("synchronizes after each local change of an item", async () => {
  const set = await setup();
  await set.consent.save(defaultConsent(profile));
  await set.pair();
  start(set.controller);
  await vi.waitFor(() => {
    expect(set.syncs()).toBeGreaterThan(0);
  });
  await tick();
  const { items } = wireHead(set.platform);
  const runsAfter = async (action: () => Promise<unknown>) => {
    await tick();
    const before = set.syncs();
    await action();
    await vi.waitFor(
      () => {
        expect(set.syncs()).toBeGreaterThan(before);
      },
      { timeout: 3000 },
    );
  };
  let id = "";
  await runsAfter(async () => {
    id = (await items.add({ title: "Rzecz" })).id;
  });
  await runsAfter(() => items.complete(id));
  await runsAfter(() => items.remove(id));
});

it("registers the handler of the carrier entries", async () => {
  const set = await setup();
  await set.consent.save(defaultConsent(profile));
  await set.pair();
  start(set.controller);
  await vi.waitFor(() => {
    expect(set.syncs()).toBeGreaterThan(0);
  });
  await tick();
  const { head } = wireHead(set.platform);
  const before = set.syncs();
  await head.add({ title: "Rzecz" });
  await vi.waitFor(
    () => {
      expect(set.syncs()).toBeGreaterThan(before);
    },
    { timeout: 3000 },
  );
  expect(wireHead(set.platform).carriers).toBe(wireHead(set.platform).carriers);
});
