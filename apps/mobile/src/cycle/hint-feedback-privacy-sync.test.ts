import { afterEach, expect, it, vi } from "vitest";

import { isRun, SLOW, start, stoppers } from "../sync/wiring-test-support";
import { decryptedEnvelopes, setupCycleDevice } from "./cycle-test-support";
import {
  createHintFeedbackRepository,
  HINT_FEEDBACK,
} from "./hint-feedback-repository";

afterEach(() => {
  for (const stop of stoppers.splice(0)) stop();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const isPost = (call: string) => call.startsWith("POST") && isRun(call);
const FORBIDDEN = [
  "HintFeedback",
  "accurate",
  "notPushy",
  "2026-11-01/2026-11-14",
  "hint-feedback",
];

it(
  "never sends the answers of the survey on the hints in an envelope",
  async () => {
    const { set, storage } = await setupCycleDevice();
    const feedback = createHintFeedbackRepository(set.platform.database);
    await feedback.noteFirstHint("2026-10-31");
    await feedback.save("2026-11-14", 4, 2);

    const sent = set.nextCall(isPost);
    start(set.controller);
    await sent;

    const contents = decryptedEnvelopes(set.sodium, set.postedBodies());
    expect(contents.length).toBeGreaterThan(0);
    for (const content of contents) {
      for (const word of FORBIDDEN) expect(content).not.toContain(word);
    }
    expect(await set.platform.database.list(HINT_FEEDBACK)).toHaveLength(2);
    expect(storage.setItem).not.toHaveBeenCalled();
  },
  SLOW,
);
