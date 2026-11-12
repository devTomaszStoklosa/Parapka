import { describe, expect, it } from "vitest";

import { pl } from "../i18n/pl";
import {
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
