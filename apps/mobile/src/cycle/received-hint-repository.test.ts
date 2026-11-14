import type { ContentChange } from "@parapka/protocol";
import { describe, expect, it } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import {
  createReceivedHintRepository,
  RECEIVED,
} from "./received-hint-repository";

const change = (id: string, forDate: string): ContentChange => {
  const field = (value: string) => ({ value, hlc: "000000000000001-00000-a" });
  return {
    entity: "Hint",
    id,
    op: "upsert",
    fields: {
      forDate: field(forDate),
      text: field(`Tekst ${id}`),
      category: field("space"),
      status: field("scheduled"),
    },
  };
};

function setup(today = { value: "2026-11-14" }) {
  const database = createMemoryDatabase();
  const received = createReceivedHintRepository({
    database,
    today: () => today.value,
  });
  return { database, received, today };
}

it("gives the hint of today and the history, the newest first", async () => {
  const { received } = setup();
  await received.merge(change("h0", "2026-11-14"));
  await received.merge(change("h1", "2026-11-12"));
  await received.merge(change("h2", "2026-11-13"));
  await received.merge(change("h3", "2026-11-16"));
  expect(await received.today()).toMatchObject({ id: "h0" });
  expect((await received.history()).map(({ id }) => id)).toEqual(["h2", "h1"]);
});

it("removes the hints older than 14 days, also from the clock moving on", async () => {
  const { received, database, today } = setup();
  await received.merge(change("old", "2026-10-30"));
  expect(await database.list(RECEIVED)).toEqual([]);
  await received.merge(change("edge", "2026-10-31"));
  let told = 0;
  received.subscribe(() => (told += 1));
  today.value = "2026-11-15";
  expect(await received.history()).toEqual([]);
  expect(told).toBe(1);
});

it("forgets everything and tells the listeners", async () => {
  const { received, database } = setup();
  await received.merge(change("h0", "2026-11-14"));
  let told = 0;
  received.subscribe(() => (told += 1));
  await received.forgetReceived();
  expect(await database.list(RECEIVED)).toEqual([]);
  expect(told).toBe(1);
});

describe("forgetSent", () => {
  const hlc = (n: number) => `${String(n).padStart(15, "0")}-00000-a`;
  const at = (id: string, forDate: string, n: number): ContentChange => {
    const sent = change(id, forDate);
    if (sent.op !== "upsert") throw new Error("not an upsert");
    const fields = Object.fromEntries(
      Object.entries(sent.fields).map(([name, { value }]) => [
        name,
        { value, hlc: hlc(n) },
      ]),
    );
    return { ...sent, fields };
  };
  const ids = async (database: ReturnType<typeof setup>["database"]) =>
    (await database.list(RECEIVED)).map(({ id }) => id).sort();

  it("removes the days from the date on and keeps the earlier ones", async () => {
    const { received, database } = setup();
    await received.merge(at("past", "2026-11-13", 1));
    await received.merge(at("today", "2026-11-14", 1));
    await received.merge(at("next", "2026-11-15", 1));
    let told = 0;
    received.subscribe(() => (told += 1));
    await received.forgetSent("2026-11-14", hlc(5));
    expect(await ids(database)).toEqual(["past"]);
    expect(told).toBe(1);
  });

  it("removes every day without a date, but not what is newer than the command", async () => {
    const { received, database } = setup();
    await received.merge(at("old", "2026-11-13", 1));
    await received.merge(at("late", "2026-11-14", 9));
    await received.forgetSent(null, hlc(5));
    expect(await ids(database)).toEqual(["late"]);
  });

  it("tells nobody when nothing was removed", async () => {
    const { received } = setup();
    await received.merge(at("late", "2026-11-14", 9));
    let told = 0;
    received.subscribe(() => (told += 1));
    await received.forgetSent(null, hlc(5));
    expect(told).toBe(0);
  });

  it("removes a record without a valid hint when every day goes", async () => {
    const { received, database } = setup();
    await database.put(RECEIVED, "broken", {
      state: {
        entity: "Hint",
        id: "broken",
        fields: { text: { value: "", hlc: hlc(1) } },
        deletedAt: null,
        restoredAt: null,
      },
    });
    await received.forgetSent(null, hlc(5));
    expect(await ids(database)).toEqual([]);
  });
});
