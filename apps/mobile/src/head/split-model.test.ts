import { mentalLoadSplit, mentalLoadTrend } from "@parapka/domain";
import { describe, expect, it } from "vitest";

import type { StoredItem } from "./item-repository";
import {
  currentLoad,
  isoWeek,
  weekInputs,
  type SplitEntry,
} from "./split-model";

const local = (y: number, m: number, d: number, h = 12) =>
  new Date(y, m - 1, d, h).getTime();

const item = (id: string, over: Partial<StoredItem> = {}): StoredItem => ({
  id,
  title: id,
  category: "home",
  weight: 2,
  dueDate: null,
  status: "open",
  doneAt: null,
  shared: true,
  ...over,
});

const entry = (itemId: string, carrierId: string, at: number): SplitEntry => ({
  itemId,
  carrierId,
  hlc: { physical: at, counter: 0, deviceId: "a" },
});

describe("isoWeek", () => {
  it.each([
    [[2025, 12, 29], "2026-W01"],
    [[2026, 1, 4], "2026-W01"],
    [[2026, 1, 5], "2026-W02"],
    [[2021, 1, 3], "2020-W53"],
    [[2026, 12, 31], "2026-W53"],
    [[2027, 1, 3], "2026-W53"],
    [[2027, 1, 4], "2027-W01"],
  ] as const)("puts %j in %s", ([y, m, d], week) => {
    expect(isoWeek(local(y, m, d))).toBe(week);
  });
});

describe("currentLoad", () => {
  const t = local(2026, 3, 1);

  it("gives 56% / 44% for the example of the spec, on both phones", () => {
    const items = [
      item("a1"),
      item("a2"),
      item("b1", { weight: 3 }),
      item("c1", { weight: 1 }),
    ];
    const entries = [
      entry("a1", "A", t),
      entry("a2", "A", t),
      entry("b1", "B", t),
      entry("c1", "both", t),
    ];
    expect(mentalLoadSplit(currentLoad(items, entries, "A"))).toEqual({
      me: 56,
      partner: 44,
    });
    expect(mentalLoadSplit(currentLoad(items, entries, "B"))).toEqual({
      me: 44,
      partner: 56,
    });
  });

  it("leaves out done, private and carrier-less items", () => {
    const items = [
      item("done", { status: "done", doneAt: t }),
      item("private", { shared: false }),
      item("none"),
    ];
    const entries = [entry("done", "A", t), entry("private", "A", t)];
    expect(currentLoad(items, entries, "A")).toEqual([]);
  });
});

describe("weekInputs", () => {
  const now = local(2026, 3, 11);

  it("is empty without a shared entry", () => {
    expect(weekInputs([item("p", { shared: false })], [], "A", now)).toEqual(
      [],
    );
    expect(weekInputs([], [entry("x", "A", now)], "A", now)).toEqual([]);
  });

  it("runs from the week of the first entry to the current one", () => {
    const entries = [entry("a", "A", local(2026, 2, 25))];
    const weeks = weekInputs([item("a")], entries, "A", now);
    expect(weeks.map(({ week }) => week)).toEqual([
      "2026-W09",
      "2026-W10",
      "2026-W11",
    ]);
    expect(weeks.every(({ items }) => items.length === 1)).toBe(true);
  });

  it("keeps an item out of the weeks before its first entry", () => {
    const entries = [
      entry("a", "A", local(2026, 2, 25)),
      entry("b", "A", local(2026, 3, 10)),
    ];
    const weeks = weekInputs(
      [item("a"), item("b"), item("z")],
      entries,
      "A",
      now,
    );
    expect(weeks.map(({ items }) => items.length)).toEqual([1, 1, 2]);
  });

  it("does not change the week in which an item was open once it is done", () => {
    const entries = [entry("a", "A", local(2026, 2, 25))];
    const done = item("a", { status: "done", doneAt: local(2026, 3, 10) });
    const counts = weekInputs([done], entries, "A", now).map(
      ({ items }) => items.length,
    );
    expect(counts).toEqual([1, 1, 0]);
  });

  it("takes the carrier as of the end of the week", () => {
    const entries = [
      entry("a", "A", local(2026, 2, 25)),
      entry("a", "B", local(2026, 3, 8, 23)),
      entry("a", "A", local(2026, 3, 9, 0)),
    ];
    const carriers = weekInputs([item("a")], entries, "A", now).map(
      ({ items }) => items[0]?.carrier,
    );
    expect(carriers).toEqual(["me", "partner", "me"]);
  });

  it("covers at most 12 weeks", () => {
    const entries = [entry("a", "A", local(2025, 1, 1))];
    const weeks = weekInputs([item("a")], entries, "A", now);
    expect(weeks).toHaveLength(12);
    expect(weeks[11]?.week).toBe("2026-W11");
    expect(mentalLoadTrend(weeks)).toHaveLength(12);
  });

  it("has a week without items with a null split", () => {
    const entries = [entry("a", "A", local(2026, 2, 25))];
    const done = item("a", { status: "done", doneAt: local(2026, 2, 26) });
    const trend = mentalLoadTrend(weekInputs([done], entries, "A", now));
    expect(trend.map(({ split }) => split)).toEqual([null, null, null]);
  });
});
