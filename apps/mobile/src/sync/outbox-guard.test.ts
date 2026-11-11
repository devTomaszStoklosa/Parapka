import { expect, it } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { removeForeignEnvelopes, removeMailboxEnvelopes } from "./outbox-guard";

async function queue() {
  const database = createMemoryDatabase();
  for (const [id, pairMailboxId] of [
    ["e1", "old"],
    ["e2", "new"],
    ["e3", "old"],
  ] as const) {
    await database.put("sync-outbox", id, { envelopeId: id, pairMailboxId });
  }
  return database;
}

const ids = async (database: Awaited<ReturnType<typeof queue>>) =>
  (await database.list("sync-outbox")).map((r) => r.id);

it("removes the envelopes of one mailbox", async () => {
  const database = await queue();
  await removeMailboxEnvelopes(database, "old");
  expect(await ids(database)).toEqual(["e2"]);
});

it("removes the envelopes of every other mailbox", async () => {
  const database = await queue();
  await removeForeignEnvelopes(database, "old");
  expect(await ids(database)).toEqual(["e1", "e3"]);
});

it("keeps the envelopes of the mailbox that is being closed", async () => {
  const database = await queue();
  await database.put("pair-closing", "current", { pairMailboxId: "old" });
  await removeForeignEnvelopes(database, "new");
  expect(await ids(database)).toEqual(["e1", "e2", "e3"]);
});

it("removes the other foreign envelopes when a mailbox is being closed", async () => {
  const database = await queue();
  await database.put("pair-closing", "current", { pairMailboxId: "other" });
  await removeForeignEnvelopes(database, "new");
  expect(await ids(database)).toEqual(["e2"]);
});
