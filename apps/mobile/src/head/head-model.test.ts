import { describe, expect, it } from "vitest";

import { pl } from "../i18n/pl";
import {
  archiveLines,
  archivedItems,
  canTakeOver,
  carrierText,
  detailLines,
  formError,
  openItems,
  weightText,
} from "./head-model";
import type { HeadItem } from "./head-service";

const item = (id: string, changes: Partial<HeadItem> = {}): HeadItem => ({
  id,
  title: `Rzecz ${id}`,
  category: "other",
  weight: 2,
  dueDate: null,
  status: "open",
  doneAt: null,
  shared: true,
  carrier: "me",
  ...changes,
});

describe("the order of the open items", () => {
  it("puts the dated ones first, the nearest first, then the newest", () => {
    const list = openItems([
      item("1"),
      item("2", { dueDate: "2026-12-01" }),
      item("3"),
      item("4", { dueDate: "2026-11-20" }),
      item("5", { dueDate: "2026-12-01" }),
    ]);
    expect(list.map(({ id }) => id)).toEqual(["4", "5", "2", "3", "1"]);
  });

  it("leaves out the done items", () => {
    const list = openItems([item("1"), item("2", { status: "done" })]);
    expect(list.map(({ id }) => id)).toEqual(["1"]);
  });
});

describe("the texts of a row", () => {
  it("names who carries the item", () => {
    expect(carrierText("me", null)).toBe(pl.head.carriers.me);
    expect(carrierText("both", "Ola")).toBe(pl.head.carriers.both);
    expect(carrierText("partner", null)).toBe(pl.head.carriers.partner);
    expect(carrierText("partner", "Ola")).toBe("Ola");
    expect(carrierText(null, "Ola")).toBe(pl.head.carriers.none);
  });

  it("lists category, weight, carrier and the due date when there is one", () => {
    expect(detailLines(item("1", { category: "home" }), null)).toEqual([
      pl.head.categories.home,
      pl.head.weights["2"],
      pl.head.carriers.me,
    ]);
    expect(
      detailLines(item("1", { dueDate: "2026-11-20", carrier: null }), null),
    ).toEqual([
      pl.head.categories.other,
      pl.head.weights["2"],
      pl.head.carriers.none,
      "Termin 20.11.2026",
    ]);
    expect(weightText(3)).toBe(pl.head.weights["3"]);
  });
});

describe("the check of the quick add form", () => {
  it("accepts a title with an empty or a real due date", () => {
    expect(formError({ title: "Rzecz", dueDate: "" })).toBeNull();
    expect(formError({ title: "Rzecz", dueDate: " 2026-11-20 " })).toBeNull();
  });

  it("refuses an empty or a too long title", () => {
    expect(formError({ title: "  ", dueDate: "" })).toBe(
      "head.add.errors.titleEmpty",
    );
    expect(formError({ title: "a".repeat(81), dueDate: "" })).toBe(
      "head.add.errors.titleTooLong",
    );
  });

  it("refuses a due date that is not a day", () => {
    for (const dueDate of ["jutro", "2026-02-31", "2026-13-01", "9999-99-99"]) {
      expect(formError({ title: "Rzecz", dueDate })).toBe(
        "head.add.errors.dueDate",
      );
    }
  });
});

describe("the archive and taking over", () => {
  it("orders the done items from the latest closed, then the newest", () => {
    const list = archivedItems([
      item("1", { status: "done", doneAt: 10 }),
      item("2", { status: "done", doneAt: 30 }),
      item("3", { status: "done", doneAt: 10 }),
      item("4", { status: "done", doneAt: null }),
      item("5"),
    ]);
    expect(list.map(({ id }) => id)).toEqual(["2", "3", "1", "4"]);
    expect(archivedItems([item("1")])).toEqual([]);
  });

  it("describes an archived row by the category and the day", () => {
    const closed = item("1", {
      status: "done",
      doneAt: Date.UTC(2026, 10, 5, 12),
    });
    expect(archiveLines(closed)).toEqual(["Inne", "Zamknięto 05.11.2026"]);
    expect(archiveLines(item("2", { status: "done" }))).toEqual(["Inne"]);
  });

  it("offers taking over only for an open, shared item of the partner or both", () => {
    expect(canTakeOver(item("1", { carrier: "partner" }), true)).toBe(true);
    expect(canTakeOver(item("1", { carrier: "both" }), true)).toBe(true);
    expect(canTakeOver(item("1", { carrier: "partner" }), false)).toBe(false);
    expect(canTakeOver(item("1", { carrier: "me" }), true)).toBe(false);
    expect(canTakeOver(item("1", { carrier: null }), true)).toBe(false);
    expect(
      canTakeOver(item("1", { carrier: "partner", shared: false }), true),
    ).toBe(false);
    expect(
      canTakeOver(item("1", { carrier: "partner", status: "done" }), true),
    ).toBe(false);
  });
});
