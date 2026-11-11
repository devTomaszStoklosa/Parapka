import { expect, it, vi } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { createDisconnectRepository } from "./disconnect-repository";

it("starts with none, goes to by-partner and back after acknowledge", async () => {
  const repo = createDisconnectRepository(createMemoryDatabase());
  expect(await repo.state()).toBe("none");
  await repo.markByPartner();
  expect(await repo.state()).toBe("by-partner");
  await repo.acknowledge();
  expect(await repo.state()).toBe("none");
});

it("tells the listeners of every change until they unsubscribe", async () => {
  const database = createMemoryDatabase();
  const repo = createDisconnectRepository(database);
  const listener = vi.fn();
  const unsubscribe = repo.subscribe(listener);
  await createDisconnectRepository(database).markByPartner();
  await repo.acknowledge();
  expect(listener).toHaveBeenCalledTimes(2);
  unsubscribe();
  await repo.markByPartner();
  expect(listener).toHaveBeenCalledTimes(2);
});
