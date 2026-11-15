import type { GeneratedHint } from "@parapka/domain";
import { expect, it } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import {
  createHintFeedbackRepository,
  followFirstHint,
  HINT_FEEDBACK,
} from "./hint-feedback-repository";
import { createHintRepository } from "./hint-repository";

const wait = () => new Promise((resolve) => setTimeout(resolve, 5));

it("keeps an answer with its period and tells the listeners", async () => {
  const database = createMemoryDatabase();
  const feedback = createHintFeedbackRepository(database);
  let told = 0;
  feedback.subscribe(() => (told += 1));
  expect(await feedback.state()).toEqual({ since: null, lastShown: null });
  await feedback.save("2026-11-14", 4, 2);
  expect(await database.get(HINT_FEEDBACK, "entry-2026-11-14")).toEqual({
    date: "2026-11-14",
    period: "2026-11-01/2026-11-14",
    accurate: 4,
    notPushy: 2,
  });
  expect(told).toBe(1);
});

it("counts a closing without an answer as shown, and takes the latest day", async () => {
  const database = createMemoryDatabase();
  const feedback = createHintFeedbackRepository(database);
  await feedback.close("2026-11-28");
  await feedback.close("2026-11-14");
  expect(await database.get(HINT_FEEDBACK, "entry-2026-11-14")).toEqual({
    date: "2026-11-14",
    closed: true,
  });
  expect((await feedback.state()).lastShown).toBe("2026-11-28");
});

it("keeps the earliest day of the first hint", async () => {
  const feedback = createHintFeedbackRepository(createMemoryDatabase());
  await feedback.noteFirstHint("2026-11-05");
  await feedback.noteFirstHint("2026-11-09");
  expect((await feedback.state()).since).toBe("2026-11-05");
  await feedback.noteFirstHint("2026-11-01");
  expect((await feedback.state()).since).toBe("2026-11-01");
});

const hintOn = (date: string): GeneratedHint => ({
  date,
  text: "Wskazówka",
  category: "relief",
  templateId: "t1",
  contentVersion: 1,
});

it("remembers the first hint, also a skipped one, after the hints are pruned", async () => {
  const database = createMemoryDatabase();
  const hints = createHintRepository({ database, newId: () => "h1" });
  const feedback = createHintFeedbackRepository(database);
  followFirstHint(hints, feedback);
  await hints.put(hintOn("2026-10-28"));
  await hints.setStatus("2026-10-28", "skipped");
  await wait();
  await hints.pruneBefore("2026-11-05");
  await wait();
  expect(await hints.range("2026-01-01", "2026-12-31")).toEqual([]);
  expect((await feedback.state()).since).toBe("2026-10-28");
});

it("ignores a failure of the hints", async () => {
  const feedback = createHintFeedbackRepository(createMemoryDatabase());
  const failing = {
    range: () => Promise.reject(new Error("disk")),
    subscribe: () => () => undefined,
  };
  followFirstHint(failing, feedback);
  await wait();
  expect((await feedback.state()).since).toBeNull();
});
