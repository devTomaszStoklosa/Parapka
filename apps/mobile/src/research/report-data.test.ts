import { expect, it } from "vitest";

import type { Profile } from "../data/profile";
import { createMemoryDatabase } from "../data/memory-database";
import { createProfileRepository } from "../data/profile-repository";
import { createHintFeedbackRepository } from "../cycle/hint-feedback-repository";
import { isoWeek } from "../head/split-model";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { createPairRepository } from "../pairing/pair-repository";
import { createActivityLog } from "./activity-log";
import { collectReportInput } from "./report-data";
import { computeReport } from "./research-report";

const at = (month: number, day: number) =>
  new Date(2026, month - 1, day, 12).getTime();

async function setup(cycle: Profile["cycle"]) {
  const database = createMemoryDatabase();
  const pairs = createPairRepository(database, createMemoryKeyStore(), {
    nowMs: () => at(10, 15),
  });
  await pairs.savePending(
    {
      pairMailboxId: "mailbox-MARK-1",
      deviceId: "device-MARK-2",
      signingPublicKey: "sig",
      agreementPublicKey: "agr",
    },
    { sendKey: Uint8Array.from([1]), receiveKey: Uint8Array.from([2]) },
  );
  await pairs.confirm();
  const profile = createProfileRepository(database);
  await profile.save({ name: "Imie-MARK-3", cycle } as unknown as Profile);
  const activity = createActivityLog(database);
  await activity.recordOpen(at(11, 6));
  await activity.recordOpen(at(11, 7));
  const feedback = createHintFeedbackRepository(database);
  await feedback.save("2026-11-01", 4, 5);
  await feedback.save("2026-11-02", 2, 3);
  await feedback.close("2026-11-03");
  await database.put("checkin-revealed", "2026-W43", {
    week: "2026-W43",
    answers: { text: "Tekst-MARK-4" },
  });
  const head = {
    trend: () =>
      Promise.resolve([
        { week: isoWeek(at(10, 15)), split: { me: 60, partner: 40 } },
      ]),
  };
  return { database, pairs, activity, profile, head, nowMs: at(11, 14) };
}

it("collects the input from the repositories and counts the report", async () => {
  const report = computeReport(await collectReportInput(await setup("yes")));
  expect(report).toEqual({
    reportVersion: 1,
    weeksSincePairing: 4,
    activeDaysWeek4: 2,
    checkinRevealRate: 0.25,
    hintFeedback: { count: 2, accurateAvg: 3, notPushyAvg: 4 },
    mentalLoadWeek1: { me: 60, partner: 40 },
    mentalLoadWeek6: null,
  });
});

it("leaves the survey out for a person without a cycle", async () => {
  const input = await collectReportInput(await setup("no"));
  expect(input.feedback).toBeNull();
});

it("knows no pairing date after the pair is removed", async () => {
  const sources = await setup("yes");
  await sources.pairs.remove();
  expect((await collectReportInput(sources)).confirmedAtMs).toBeNull();
});

it("has no survey before the profile is saved", async () => {
  const database = createMemoryDatabase();
  const input = await collectReportInput({
    database,
    pairs: createPairRepository(database, createMemoryKeyStore()),
    activity: createActivityLog(database),
    profile: createProfileRepository(database),
    head: { trend: () => Promise.resolve([]) },
    nowMs: at(11, 14),
  });
  expect(input.feedback).toBeNull();
});

it("puts only numbers and null in the report", async () => {
  const report = computeReport(await collectReportInput(await setup("yes")));
  const json = JSON.stringify(report);
  for (const secret of ["MARK", "2026", "W4", "Imie", "Tekst", "mailbox"]) {
    expect(json).not.toContain(secret);
  }
  const leaves = (value: unknown): unknown[] =>
    value !== null && typeof value === "object"
      ? Object.values(value).flatMap(leaves)
      : [value];
  for (const leaf of leaves(report)) {
    expect(leaf === null || typeof leaf === "number").toBe(true);
  }
});
