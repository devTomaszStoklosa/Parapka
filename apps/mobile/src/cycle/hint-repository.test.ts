import type { GeneratedHint } from "@parapka/domain";
import { describe, expect, it } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import {
  addDays,
  createHintRepository,
  currentHint,
  HINTS,
  type HintRecord,
} from "./hint-repository";

function setup() {
  const database = createMemoryDatabase();
  let counter = 0;
  const hints = createHintRepository({
    database,
    newId: () => `id-${String(++counter)}`,
  });
  return { database, hints };
}

const hint = (
  date: string,
  templateId = "a",
  text = "text",
): GeneratedHint => ({
  templateId,
  contentVersion: 3,
  category: "relief",
  date,
  text,
});

describe("put", () => {
  it("keeps one record per day in the shape of createRecordSync", async () => {
    const { database, hints } = setup();
    expect(await hints.put(hint("2026-11-08"))).toBe(true);
    const [stored] = await database.list(HINTS);
    const record = stored?.value as unknown as HintRecord;
    expect(stored?.id).toBe("id-1");
    expect(record.shared).toBe(true);
    expect(record.state).toMatchObject({ id: "id-1", fields: {} });
    expect(record.pending.fields).toEqual({
      forDate: "2026-11-08",
      text: "text",
      category: "relief",
      status: "scheduled",
    });
    expect(record.local).toEqual({ templateId: "a", contentVersion: 3 });
    expect(record.state.entity).toBe("Hint");
    expect(currentHint(record)).toMatchObject(record.pending.fields ?? {});
  });

  it("replaces the version of the day in the same record", async () => {
    const { database, hints } = setup();
    await hints.put(hint("2026-11-08"));
    expect(await hints.put(hint("2026-11-08", "b", "other"))).toBe(true);
    expect((await database.list(HINTS)).map(({ id }) => id)).toEqual(["id-1"]);
    expect(await hints.forDate("2026-11-08")).toMatchObject({
      templateId: "b",
      text: "other",
    });
  });

  it("writes and tells nothing for the same template and text", async () => {
    const { hints } = setup();
    await hints.put(hint("2026-11-08"));
    let changes = 0;
    hints.subscribe(() => (changes += 1));
    expect(await hints.put(hint("2026-11-08"))).toBe(false);
    expect(changes).toBe(0);
  });
});

describe("reading and pruning", () => {
  it("gives null for a day without a hint", async () => {
    expect(await setup().hints.forDate("2026-11-08")).toBeNull();
  });

  it("lists a range, the oldest first", async () => {
    const { hints } = setup();
    await hints.put(hint("2026-11-10"));
    await hints.put(hint("2026-11-08"));
    await hints.put(hint("2026-11-20"));
    const range = await hints.range("2026-11-08", "2026-11-10");
    expect(range.map((h) => h.forDate)).toEqual(["2026-11-08", "2026-11-10"]);
  });

  it("removes the days before a date and tells only when it did", async () => {
    const { database, hints } = setup();
    await hints.put(hint("2026-11-01"));
    await hints.put(hint("2026-11-08"));
    let changes = 0;
    hints.subscribe(() => (changes += 1));
    await hints.pruneBefore("2026-11-08");
    expect(changes).toBe(1);
    expect((await database.list(HINTS)).length).toBe(1);
    await hints.pruneBefore("2026-11-08");
    expect(changes).toBe(1);
  });

  it("counts days over month ends", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
  });
});

describe("currentHint", () => {
  it("puts the pending fields on top of the sent ones", async () => {
    const { database, hints } = setup();
    await hints.put(hint("2026-11-08"));
    const [stored] = await database.list(HINTS);
    const record = stored?.value as unknown as HintRecord;
    const sent = { ...record.pending.fields, text: "sent" };
    const fields = Object.fromEntries(
      Object.entries(sent).map(([name, value]) => [name, { value, hlc: "h1" }]),
    );
    const next: HintRecord = {
      ...record,
      state: { ...record.state, fields },
      pending: { fields: null, life: null },
    };
    await database.put(HINTS, "id-1", next as never);
    expect(await hints.forDate("2026-11-08")).toMatchObject({ text: "sent" });
    expect(await hints.put(hint("2026-11-08", "a", "new"))).toBe(true);
    expect(await hints.forDate("2026-11-08")).toMatchObject({ text: "new" });
  });
});

describe("resendFrom", () => {
  it("marks today and later as shared and not sent, not the earlier days", async () => {
    const { database, hints } = setup();
    for (const date of ["2026-11-13", "2026-11-14", "2026-11-15"]) {
      await hints.put(hint(date, "a", date));
    }
    await hints.sync.commit(
      await hints.sync.collect(() => "000000000000001-00000-a"),
    );
    await hints.sync.makePrivate();
    let told = 0;
    hints.subscribe(() => (told += 1));
    await hints.resendFrom("2026-11-14");
    const records = (await database.list(HINTS)).map(
      ({ value }) => value as unknown as HintRecord,
    );
    const byDate = (date: string) =>
      records.find((record) => currentHint(record).forDate === date);
    expect(byDate("2026-11-13")).toMatchObject({
      shared: false,
      pending: { fields: null },
    });
    for (const date of ["2026-11-14", "2026-11-15"]) {
      expect(byDate(date)).toMatchObject({
        shared: true,
        pending: {
          fields: { forDate: date, text: date, status: "scheduled" },
        },
      });
    }
    expect(told).toBe(2);
  });

  it("sends the newest version again with new timestamps", async () => {
    const { hints } = setup();
    await hints.put(hint("2026-11-14", "a", "stary"));
    await hints.sync.commit(
      await hints.sync.collect(() => "000000000000001-00000-a"),
    );
    await hints.put(hint("2026-11-14", "b", "nowy"));
    await hints.resendFrom("2026-11-14");
    const again = await hints.sync.collect(() => "000000000000002-00000-a");
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({
      fields: { text: { value: "nowy", hlc: "000000000000002-00000-a" } },
    });
  });
});
