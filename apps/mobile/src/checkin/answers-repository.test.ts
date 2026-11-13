import { expect, it, vi } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { createAnswersRepository } from "./answers-repository";

const answers = { mood: 3, energy: 4, closeness: 5 } as const;

it("keeps answers by week and lists the newest first", async () => {
  const repo = createAnswersRepository(createMemoryDatabase());
  expect(await repo.get("2026-W45")).toBeNull();
  await repo.put({ week: "2026-W45", answers, submittedAt: 1 });
  await repo.put({ week: "2026-W46", answers, submittedAt: 2 });
  await repo.put({ week: "2026-W44", answers, submittedAt: 0 });
  await repo.put({ week: "2026-W45", answers, submittedAt: 3 });
  expect((await repo.get("2026-W45"))?.submittedAt).toBe(3);
  expect((await repo.list()).map((entry) => entry.week)).toEqual([
    "2026-W46",
    "2026-W45",
    "2026-W44",
  ]);
});

it("notifies about a write until unsubscribed", async () => {
  const repo = createAnswersRepository(createMemoryDatabase());
  const listener = vi.fn();
  const stop = repo.subscribe(listener);
  await repo.put({ week: "2026-W45", answers, submittedAt: 1 });
  expect(listener).toHaveBeenCalledTimes(1);
  stop();
  await repo.put({ week: "2026-W45", answers, submittedAt: 2 });
  expect(listener).toHaveBeenCalledTimes(1);
});
