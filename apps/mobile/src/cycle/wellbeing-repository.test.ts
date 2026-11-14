import { expect, it, vi } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { createWellbeingRepository } from "./wellbeing-repository";
import type { WellbeingEntry } from "./wellbeing-validation";

const entry = (date: string, energy = 3): WellbeingEntry => ({
  date,
  energy,
  mood: 3,
  tension: 3,
  tags: [],
});

it("replaces the entry of a day, deletes it and notifies", async () => {
  const database = createMemoryDatabase();
  const repo = createWellbeingRepository(database);
  const listener = vi.fn();
  repo.subscribe(listener);
  await repo.put(entry("2026-11-14"));
  await repo.put(entry("2026-11-14", 5));
  expect(await repo.get("2026-11-14")).toEqual(entry("2026-11-14", 5));
  expect(await database.list("wellbeing-entries")).toHaveLength(1);
  await repo.delete("2026-11-14");
  expect(await repo.get("2026-11-14")).toBeNull();
  expect(listener).toHaveBeenCalledTimes(3);
});

it("lists the entries of a date range, the oldest first", async () => {
  const repo = createWellbeingRepository(createMemoryDatabase());
  for (const day of ["13", "11", "12", "15"]) {
    await repo.put(entry(`2026-11-${day}`));
  }
  const dates = (await repo.range("2026-11-12", "2026-11-14")).map(
    (found) => found.date,
  );
  expect(dates).toEqual(["2026-11-12", "2026-11-13"]);
});
