import { describe, expect, it } from "vitest";

import { canConvert, detailLines } from "./head-model";
import type { HeadItem } from "./head-service";

const item = (extra: Partial<HeadItem>): HeadItem => ({
  id: "i-1",
  title: "Rzecz",
  category: "other",
  weight: 2,
  dueDate: null,
  status: "open",
  shared: true,
  carrier: "me",
  doneAt: null,
  linkedChoreId: null,
  ...extra,
});

describe("canConvert", () => {
  it("is offered for an open item without a chore", () => {
    expect(canConvert(item({}))).toBe(true);
    expect(canConvert(item({ linkedChoreId: "c-1" }))).toBe(false);
    expect(canConvert(item({ status: "done" }))).toBe(false);
  });
});

describe("detailLines", () => {
  it("says when the item is in the planner", () => {
    expect(detailLines(item({}), null)).not.toContain("Jest w planerze");
    expect(detailLines(item({ linkedChoreId: "c-1" }), null)).toContain(
      "Jest w planerze",
    );
  });
});
