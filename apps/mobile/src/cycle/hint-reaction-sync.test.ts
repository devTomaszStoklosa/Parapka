import { afterEach, expect, it, vi } from "vitest";

import { isRun, SLOW, start, stoppers } from "../sync/wiring-test-support";
import {
  decryptedEnvelopes,
  privacyClock,
  setupCycleDevice,
} from "./cycle-test-support";
import { wireCycleHints } from "./wiring";

afterEach(() => {
  for (const stop of stoppers.splice(0)) stop();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const isPost = (call: string) => call.startsWith("POST") && isRun(call);
const HINT_ID = "partner-hint-0001";
const FORBIDDEN = [
  "HintReaction",
  "hint-reactions",
  "done",
  "notToday",
  HINT_ID,
];

it(
  "keeps the reaction to a hint of the partner on the phone (FR-CYC-11)",
  async () => {
    const { set, storage } = await setupCycleDevice();
    const { received, reactions } = wireCycleHints({
      ...set.platform,
      clock: privacyClock,
    });
    const field = (value: string) => ({
      value,
      hlc: "000000000000001-00000-a",
    });
    await received.merge({
      entity: "Hint",
      id: HINT_ID,
      op: "upsert",
      fields: {
        forDate: field("2026-11-14"),
        text: field("Wskazówka od partnera"),
        category: field("space"),
        status: field("scheduled"),
      },
    });

    const sent = set.nextCall(isPost);
    start(set.controller);
    await sent;

    const before = set.posts();
    await reactions.set(HINT_ID, "done");
    const forced = set.nextCall(isRun);
    set.controller.setActive(false);
    set.controller.setActive(true);
    await forced;

    expect(set.posts()).toBe(before);
    const contents = decryptedEnvelopes(set.sodium, set.postedBodies());
    expect(contents.length).toBeGreaterThan(0);
    for (const content of contents) {
      for (const word of FORBIDDEN) expect(content).not.toContain(word);
    }
    expect(await reactions.get(HINT_ID)).toBe("done");
    expect(storage.setItem).not.toHaveBeenCalled();
  },
  SLOW,
);
