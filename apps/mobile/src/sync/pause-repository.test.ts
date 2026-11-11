import { expect, it, vi } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { createPauseRepository } from "./pause-repository";

it("is not paused by default and keeps what is set", async () => {
  const repo = createPauseRepository(createMemoryDatabase());
  expect(await repo.isPaused()).toBe(false);
  await repo.setPaused(true);
  expect(await repo.isPaused()).toBe(true);
  await repo.setPaused(false);
  expect(await repo.isPaused()).toBe(false);
});

it("notifies the listeners, also of another instance, until they unsubscribe", async () => {
  const db = createMemoryDatabase();
  const listener = vi.fn();
  const unsubscribe = createPauseRepository(db).subscribe(listener);
  await createPauseRepository(db).setPaused(true);
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
  await createPauseRepository(db).setPaused(false);
  expect(listener).toHaveBeenCalledTimes(1);
});
