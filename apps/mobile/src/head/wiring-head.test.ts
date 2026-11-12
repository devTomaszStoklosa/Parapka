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

async function started() {
  const set = await setup();
  await set.consent.save(defaultConsent(profile));
  await set.pair();
  start(set.controller);
  await vi.waitFor(() => {
    expect(set.syncs()).toBeGreaterThan(0);
  });
  await tick();
  return set;
}

/** Runs the action and waits until it triggered another synchronization. */
async function runsAfter(
  set: Awaited<ReturnType<typeof started>>,
  action: () => Promise<unknown>,
) {
  await tick();
  const before = set.syncs();
  await action();
  await vi.waitFor(
    () => {
      expect(set.syncs()).toBeGreaterThan(before);
    },
    { timeout: 3000 },
  );
}

it("synchronizes after each local change of an item", async () => {
  const set = await started();
  const { items } = wireHead(set.platform);
  let id = "";
  await runsAfter(set, async () => {
    id = (await items.add({ title: "Rzecz" })).id;
  });
  await runsAfter(set, () => items.complete(id));
  await runsAfter(set, () => items.remove(id));
});

it("registers the handler of the handover requests", async () => {
  const set = await started();
  const { handovers, handover } = wireHead(set.platform);
  expect(handover).toBe(wireHead(set.platform).handover);
  await runsAfter(set, () =>
    handovers.append({
      requestId: "r-1",
      itemId: "i-1",
      requestedBy: "d-1",
      status: "pending",
      shared: true,
    }),
  );
});

it("registers the handler of the carrier entries", async () => {
  const set = await started();
  const { head } = wireHead(set.platform);
  await runsAfter(set, () => head.add({ title: "Rzecz" }));
  expect(wireHead(set.platform).carriers).toBe(wireHead(set.platform).carriers);
});
