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
  "Boli mnie głowa po pracy",
  "headache",
  "WellbeingEntry",
  "tension",
  "desire",
  "tags",
  "note",
];

it(
  "never sends a wellbeing entry in an envelope and keeps it in the local database",
  async () => {
    const { set, storage, cycle } = await setupCycleDevice();
    await cycle.saveWellbeing({
      date: "2026-11-14",
      energy: 1,
      mood: 2,
      tension: 5,
      desire: 3,
      tags: ["headache"],
      note: "Boli mnie głowa po pracy",
    });

    const sent = set.nextCall(isPost);
    start(set.controller);
    await sent;

    const contents = decryptedEnvelopes(set.sodium, set.postedBodies());
    expect(contents.length).toBeGreaterThan(0);
    for (const content of contents) {
      for (const word of FORBIDDEN) expect(content).not.toContain(word);
    }
    expect(await set.platform.database.list("wellbeing-entries")).toHaveLength(
      1,
    );
    expect(storage.setItem).not.toHaveBeenCalled();
  },
  SLOW,
);
