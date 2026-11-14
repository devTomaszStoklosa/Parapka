import { expect, it } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import {
  createHintReactionRepository,
  HINT_REACTIONS,
} from "./hint-reaction-repository";

it("keeps a reaction, replaces it and tells the listeners", async () => {
  const reactions = createHintReactionRepository(createMemoryDatabase());
  let told = 0;
  reactions.subscribe(() => (told += 1));
  expect(await reactions.get("h1")).toBeNull();
  await reactions.set("h1", "done");
  expect(await reactions.get("h1")).toBe("done");
  await reactions.set("h1", "notToday");
  expect(await reactions.get("h1")).toBe("notToday");
  expect(told).toBe(2);
});

it("reads the reactions of the given hints and skips the others", async () => {
  const reactions = createHintReactionRepository(createMemoryDatabase());
  await reactions.set("h1", "done");
  await reactions.set("h2", "notToday");
  await reactions.set("h3", "done");
  expect(await reactions.getMany(["h1", "h2", "none"])).toEqual({
    h1: "done",
    h2: "notToday",
  });
});

it("ignores a stored value that is not a reaction", async () => {
  const database = createMemoryDatabase();
  await database.put(HINT_REACTIONS, "h1", { reaction: "maybe" });
  await database.put(HINT_REACTIONS, "h2", {});
  const reactions = createHintReactionRepository(database);
  expect(await reactions.getMany(["h1", "h2"])).toEqual({});
});
