import { expect, it } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { createActivityLog } from "./activity-log";

const at = (month: number, day: number, hour: number, minute = 0) =>
  new Date(2026, month - 1, day, hour, minute).getTime();

it("keeps one entry for three openings of a day", async () => {
  const log = createActivityLog(createMemoryDatabase());
  await log.recordOpen(at(11, 14, 8));
  await log.recordOpen(at(11, 14, 12));
  await log.recordOpen(at(11, 14, 23, 59));
  expect(await log.days()).toEqual(["2026-11-14"]);
});

it("adds a new entry for an opening after midnight", async () => {
  const log = createActivityLog(createMemoryDatabase());
  await log.recordOpen(at(11, 14, 23, 59));
  await log.recordOpen(at(11, 15, 0, 1));
  expect(await log.days()).toEqual(["2026-11-14", "2026-11-15"]);
});

it("drops the entries older than 120 days on a write", async () => {
  const log = createActivityLog(createMemoryDatabase());
  await log.recordOpen(at(7, 1, 12));
  await log.recordOpen(at(7, 20, 12));
  await log.recordOpen(at(11, 14, 12));
  // 120 days before 14 November is 17 July: 1 July goes, 20 July stays.
  expect(await log.days()).toEqual(["2026-07-20", "2026-11-14"]);
});
