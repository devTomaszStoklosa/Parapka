import { afterEach, expect, it, vi } from "vitest";

import { defaultConsent } from "../consent/consent-model";
import {
  isRun,
  profile,
  runsAfter,
  setup,
  SLOW,
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
  const first = set.nextCall(isRun);
  start(set.controller);
  await first;
  await tick();
  return set;
}

it(
  "synchronizes after each local change of an item",
  async () => {
    const set = await started();
    const { items } = wireHead(set.platform);
    let id = "";
    await runsAfter(set, async () => {
      id = (await items.add({ title: "Rzecz" })).id;
    });
    await runsAfter(set, () => items.complete(id));
    await runsAfter(set, () => items.remove(id));
  },
  SLOW,
);

it(
  "registers the handler of the handover requests",
  async () => {
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
  },
  SLOW,
);

it(
  "registers the handler of the carrier entries",
  async () => {
    const set = await started();
    const { head } = wireHead(set.platform);
    await runsAfter(set, () => head.add({ title: "Rzecz" }));
    expect(wireHead(set.platform).carriers).toBe(
      wireHead(set.platform).carriers,
    );
  },
  SLOW,
);
