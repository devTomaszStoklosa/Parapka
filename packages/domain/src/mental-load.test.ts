import { describe, expect, it } from "vitest";
import {
  ChoreValidationError,
  createMentalLoadItem,
  mentalLoadSplit,
  mentalLoadTrend,
  type MentalLoadItem,
} from "./index.js";

const item = (
  carrier: MentalLoadItem["carrier"],
  weight: 1 | 2 | 3 = 2,
  status: MentalLoadItem["status"] = "open",
): MentalLoadItem => ({ category: "home", carrier, weight, status });

describe("createMentalLoadItem", () => {
  it("defaults to weight 2 and open", () => {
    expect(createMentalLoadItem({ category: "health", carrier: "me" })).toEqual(
      {
        category: "health",
        carrier: "me",
        weight: 2,
        status: "open",
      },
    );
  });

  it("rejects an invalid weight", () => {
    expect(() =>
      createMentalLoadItem({ category: "home", carrier: "me", weight: 4 }),
    ).toThrow(ChoreValidationError);
  });
});

describe("mentalLoadSplit", () => {
  it("matches the FR-MNT-04 example: 56% and 44%", () => {
    const split = mentalLoadSplit([
      item("me"),
      item("me"),
      item("partner", 3),
      item("both", 1),
    ]);
    expect(split).toEqual({ me: 56, partner: 44 });
  });

  it("counts a shared item half for each", () => {
    expect(mentalLoadSplit([item("both", 3)])).toEqual({ me: 50, partner: 50 });
  });

  it("always sums to 100", () => {
    for (const a of [1, 2, 3] as const) {
      for (const b of [1, 2, 3] as const) {
        for (const c of [1, 2, 3] as const) {
          const split = mentalLoadSplit([
            item("me", a),
            item("partner", b),
            item("both", c),
          ]);
          expect(split).not.toBeNull();
          expect((split?.me ?? 0) + (split?.partner ?? 0)).toBe(100);
        }
      }
    }
    expect(
      mentalLoadSplit([item("me"), item("partner"), item("partner")]),
    ).toEqual({
      me: 33,
      partner: 67,
    });
  });

  it("ignores done items", () => {
    const open = [item("me"), item("partner", 1)];
    expect(mentalLoadSplit([...open, item("partner", 3, "done")])).toEqual(
      mentalLoadSplit(open),
    );
  });

  it("returns null without open items", () => {
    expect(mentalLoadSplit([])).toBeNull();
    expect(mentalLoadSplit([item("me", 2, "done")])).toBeNull();
  });
});

describe("mentalLoadTrend", () => {
  it("orders snapshots from the oldest week", () => {
    const trend = mentalLoadTrend([
      { week: "2026-W03", items: [item("me")] },
      { week: "2025-W52", items: [item("partner")] },
      { week: "2026-W01", items: [] },
    ]);
    expect(trend).toEqual([
      { week: "2025-W52", split: { me: 0, partner: 100 } },
      { week: "2026-W01", split: null },
      { week: "2026-W03", split: { me: 100, partner: 0 } },
    ]);
  });

  it("keeps at most the 12 latest weeks", () => {
    const weeks = Array.from({ length: 15 }, (_, i) => ({
      week: `2026-W${String(i + 1).padStart(2, "0")}`,
      items: [item("me")],
    }));
    const trend = mentalLoadTrend(weeks);
    expect(trend).toHaveLength(12);
    expect(trend[0]?.week).toBe("2026-W04");
    expect(trend[11]?.week).toBe("2026-W15");
  });

  it("contains only the week and the split, no judgements (ZP-2)", () => {
    const [snapshot] = mentalLoadTrend([
      { week: "2026-W01", items: [item("me")] },
    ]);
    expect(Object.keys(snapshot ?? {}).sort()).toEqual(["split", "week"]);
    expect(Object.keys(snapshot?.split ?? {}).sort()).toEqual([
      "me",
      "partner",
    ]);
  });

  it("rejects a malformed week", () => {
    expect(() => mentalLoadTrend([{ week: "2026-7", items: [] }])).toThrow(
      ChoreValidationError,
    );
  });
});
