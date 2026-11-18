import { afterEach, expect, it, vi } from "vitest";

import {
  decryptedEnvelopes,
  setupCycleDevice,
} from "../cycle/cycle-test-support";
import { isRun, SLOW, start, stoppers } from "../sync/wiring-test-support";
import { createActivityLog } from "./activity-log";

afterEach(() => {
  for (const stop of stoppers.splice(0)) stop();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const isPost = (call: string) => call.startsWith("POST") && isRun(call);

it(
  "never sends the activity days or the pairing date in an envelope",
  async () => {
    const { set } = await setupCycleDevice();
    const { database } = set.platform;
    await createActivityLog(database).recordOpen(
      new Date(2026, 9, 7, 12).getTime(),
    );
    const pair = await set.pairs.current();
    const confirmedAtMs = pair?.confirmedAtMs;
    expect(confirmedAtMs).toBeTypeOf("number");

    const sent = set.nextCall(isPost);
    start(set.controller);
    await sent;

    const contents = decryptedEnvelopes(set.sodium, set.postedBodies());
    expect(contents.length).toBeGreaterThan(0);
    for (const content of contents) {
      expect(content).not.toContain("2026-10-07");
      expect(content).not.toContain("activity");
      expect(content).not.toContain("confirmedAtMs");
      expect(content).not.toContain(String(confirmedAtMs));
    }
    expect(await database.list("activity-log")).toHaveLength(1);
  },
  SLOW,
);
