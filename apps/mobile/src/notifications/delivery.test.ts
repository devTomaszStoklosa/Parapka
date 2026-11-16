import { expect, it } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import {
  enqueueNotification,
  listQueued,
  markDelivered,
  messageFor,
  OVERDUE_MS,
  RETENTION_MS,
  takeDue,
} from "./delivery";
import type { PlannedNotification } from "./planned";

const NOW = new Date(2026, 10, 16, 18, 30).getTime();

const planned = (id: string, atMs: number): PlannedNotification => ({
  id,
  type: "chore-reminder",
  atMs,
  title: {
    key: "notifications.choreReminder.title",
    params: { title: "Śmieci" },
  },
  body: { key: "notifications.choreReminder.body" },
});

const ids = (items: readonly PlannedNotification[]) =>
  items.map((item) => item.id);

const take = async (
  db: ReturnType<typeof createMemoryDatabase>,
  items: PlannedNotification[],
  nowMs: number,
) => {
  const { due, show } = await takeDue(db, items, nowMs);
  await markDelivered(db, due);
  return ids(show);
};

it("returns a due notification once", async () => {
  const db = createMemoryDatabase();
  const item = planned("a", NOW - 1000);
  expect(await take(db, [item], NOW)).toEqual(["a"]);
  expect(await take(db, [item], NOW + 60_000)).toEqual([]);
});

it("remembers nothing before markDelivered", async () => {
  const db = createMemoryDatabase();
  const item = planned("a", NOW - 1000);
  await takeDue(db, [item], NOW);
  expect(ids((await takeDue(db, [item], NOW)).due)).toEqual(["a"]);
});

it("keeps a notification that is not due yet", async () => {
  const db = createMemoryDatabase();
  const item = planned("a", NOW + 1000);
  expect(await take(db, [item], NOW)).toEqual([]);
  expect(await take(db, [item], NOW + 1000)).toEqual(["a"]);
});

it("skips and remembers a notification older than 24 hours", async () => {
  const db = createMemoryDatabase();
  const old = planned("old", NOW - OVERDUE_MS - 1);
  const recent = planned("recent", NOW - OVERDUE_MS);
  expect(await take(db, [old, recent], NOW)).toEqual(["recent"]);
  expect((await takeDue(db, [old], NOW)).due).toEqual([]);
});

it("forgets the delivered entries after 14 days", async () => {
  const db = createMemoryDatabase();
  await take(db, [planned("a", NOW), planned("b", NOW + 1)], NOW + 1);
  await take(db, [], NOW + RETENTION_MS + 1);
  expect((await db.list("notifications-delivered")).map((r) => r.id)).toEqual([
    "b",
  ]);
});

it("queues the notifications of events and drops the old ones", async () => {
  const db = createMemoryDatabase();
  await enqueueNotification(db, planned("old", NOW));
  await enqueueNotification(db, planned("new", NOW + RETENTION_MS));
  expect(ids(await listQueued(db))).toEqual(["new", "old"]);
  await takeDue(db, [], NOW + RETENTION_MS + 1);
  expect(ids(await listQueued(db))).toEqual(["new"]);
});

it("gives the fixed text in the discreet mode, also for a digest", () => {
  const fixed = { title: "Parapka", body: "masz nowe przypomnienie" };
  const one = messageFor([planned("a", NOW)], true);
  expect({ title: one.title, body: one.body }).toEqual(fixed);
  const many = messageFor([planned("a", NOW), planned("b", NOW)], true);
  expect({ title: many.title, body: many.body }).toEqual(fixed);
  expect(`${one.title}${one.body}`).not.toMatch(/Śmieci/);
});

it("gives the full text, or a digest of several, in the full mode", () => {
  expect(messageFor([planned("a", NOW)], false)).toEqual({
    title: "Obowiązek: Śmieci",
    body: "Zajrzyj do Parapki.",
    tag: "a",
  });
  expect(
    messageFor(
      [planned("a", NOW), planned("b", NOW), planned("c", NOW)],
      false,
    ),
  ).toEqual({
    title: "Parapka",
    body: "Masz 3 nowe przypomnienia",
    tag: "digest:a",
  });
});
