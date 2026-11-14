import { afterEach, expect, it, vi } from "vitest";

import { isRun, SLOW, start, stoppers } from "../sync/wiring-test-support";
import { decryptedEnvelopes, setupCycleDevice } from "./cycle-test-support";

afterEach(() => {
  for (const stop of stoppers.splice(0)) stop();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const isPost = (call: string) => call.startsWith("POST") && isRun(call);
const FORBIDDEN = [
  "2026-09-03",
  "2026-09-07",
  "2026-10-01",
  "PeriodLog",
  "CycleProfile",
  "startDate",
  "endDate",
  "cycleLength",
  "periodLength",
];

it(
  "never sends the cycle data in an envelope and keeps it in the local database",
  async () => {
    const { set, storage, cycle } = await setupCycleDevice();
    await cycle.savePeriod({
      id: "seed",
      startDate: "2026-09-03",
      endDate: "2026-09-07",
    });
    await cycle.savePeriod({
      id: "second",
      startDate: "2026-10-01",
      endDate: null,
    });

    const sent = set.nextCall(isPost);
    start(set.controller);
    await sent;

    const contents = decryptedEnvelopes(set.sodium, set.postedBodies());
    expect(contents.length).toBeGreaterThan(0);
    for (const content of contents) {
      for (const word of FORBIDDEN) expect(content).not.toContain(word);
    }
    expect(await set.platform.database.list("period-logs")).toHaveLength(2);
    expect(
      await set.platform.database.get("cycle-settings", "me"),
    ).not.toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
  },
  SLOW,
);
