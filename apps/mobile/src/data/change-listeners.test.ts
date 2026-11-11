import { expect, it, vi } from "vitest";
import { changeChannel } from "./change-listeners";
import { createMemoryDatabase } from "./memory-database";

it("shares listeners per database and channel name", () => {
  const db = createMemoryDatabase();
  const listener = vi.fn();
  changeChannel(db, "a").subscribe(listener);
  changeChannel(db, "a").notify();
  expect(listener).toHaveBeenCalledTimes(1);
  changeChannel(db, "b").notify();
  changeChannel(createMemoryDatabase(), "a").notify();
  expect(listener).toHaveBeenCalledTimes(1);
});

it("stops calling a listener after it unsubscribes", () => {
  const channel = changeChannel(createMemoryDatabase(), "a");
  const listener = vi.fn();
  const unsubscribe = channel.subscribe(listener);
  unsubscribe();
  channel.notify();
  expect(listener).not.toHaveBeenCalled();
});
