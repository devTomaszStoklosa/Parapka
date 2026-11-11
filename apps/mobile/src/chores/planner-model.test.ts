import type { Assignment, ChoreRule } from "@parapka/domain";
import { describe, expect, it } from "vitest";

import type { StoredChore } from "./chore-repository";
import {
  buildPlanner,
  localDate,
  type PlannerFilter,
  type PlannerView,
} from "./planner-model";

// A Wednesday.
const TODAY = "2026-11-11";

const chore = (
  id: string,
  rule: ChoreRule,
  assignment: Assignment = { kind: "person", person: "me" },
): StoredChore => ({
  id,
  title: `Obowiązek ${id}`,
  rule,
  assignment,
  shared: true,
});

const weekdays = chore("w", { kind: "weekdays", weekdays: [1, 4] });
const daily = { kind: "daily" } as const;

function lists(
  chores: StoredChore[],
  view: PlannerView = "week",
  filter: PlannerFilter = "all",
  completions: { choreId: string; occurrenceDate: string }[] = [],
) {
  return buildPlanner({
    chores,
    completions: completions.map((c) => ({
      ...c,
      completedBy: "device",
      completedAt: "hlc",
    })),
    today: TODAY,
    view,
    filter,
  });
}

const dates = (rows: { date: string }[]) => rows.map((row) => row.date);

describe("localDate", () => {
  it("gives the local calendar day of a moment", () => {
    expect(localDate(new Date(2026, 10, 5, 23, 59).getTime())).toBe(
      "2026-11-05",
    );
    expect(localDate(new Date(2026, 0, 2, 0, 1).getTime())).toBe("2026-01-02");
  });
});

describe("the windows of the views", () => {
  it("gives a rule of two weekdays two rows in the week", () => {
    const { rows } = lists([weekdays]);
    expect(dates(rows)).toEqual(["2026-11-12", "2026-11-16"]);
    expect(rows.map((row) => row.key)).toEqual([
      "w|2026-11-12",
      "w|2026-11-16",
    ]);
  });

  it("shows only today in the today view", () => {
    expect(lists([weekdays], "today").rows).toEqual([]);
    expect(dates(lists([chore("d", daily)], "today").rows)).toEqual([TODAY]);
  });

  it("looks 30 days ahead in the all view", () => {
    const { rows } = lists([chore("d", daily)], "all");
    expect(rows).toHaveLength(30);
    expect(rows.at(-1)?.date).toBe("2026-12-10");
  });

  it("orders the rows by day and title", () => {
    const { rows } = lists([chore("b", daily), chore("a", daily)], "today");
    expect(rows.map((row) => row.choreId)).toEqual(["a", "b"]);
  });
});

describe("the filter by occurrence", () => {
  const alternating = chore("alt", daily, {
    kind: "alternating",
    firstPerson: "me",
    startDate: "2026-11-10",
  });

  it("gives the partner only the days of the partner", () => {
    const partner = lists([alternating], "week", "partner").rows;
    expect(dates(partner)).toEqual([
      "2026-11-11",
      "2026-11-13",
      "2026-11-15",
      "2026-11-17",
    ]);
    const mine = lists([alternating], "week", "mine").rows;
    expect(dates(mine)).toEqual(["2026-11-12", "2026-11-14", "2026-11-16"]);
  });

  it("keeps both and anyone as shared", () => {
    const shared = [
      chore("b", daily, { kind: "both" }),
      chore("a", daily, { kind: "anyone" }),
      chore("m", daily),
      chore("p", daily, { kind: "person", person: "partner" }),
    ];
    const filtered = (filter: PlannerFilter) =>
      lists(shared, "today", filter).rows.map((row) => row.choreId);
    expect(filtered("shared")).toEqual(["a", "b"]);
    expect(filtered("mine")).toEqual(["m"]);
    expect(filtered("partner")).toEqual(["p"]);
    expect(filtered("all")).toEqual(["a", "b", "m", "p"]);
  });

  it("skips the days before the start of an alternating assignment", () => {
    const later = chore("later", daily, {
      kind: "alternating",
      firstPerson: "me",
      startDate: "2026-11-13",
    });
    const { rows, todo } = lists([later]);
    expect(dates(rows)).toEqual([
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
      "2026-11-16",
      "2026-11-17",
    ]);
    expect(todo).toEqual([]);
  });
});

describe("the list of what is to do", () => {
  it("holds the overdue occurrences that are not ticked off", () => {
    const done = [{ choreId: "d", occurrenceDate: "2026-11-09" }];
    const { todo, rows } = lists([chore("d", daily)], "today", "all", done);
    expect(todo).toHaveLength(29);
    expect(todo[0]?.date).toBe("2026-10-12");
    expect(todo.at(-1)?.date).toBe("2026-11-10");
    expect(dates(todo)).not.toContain("2026-11-09");
    expect(dates(rows)).toEqual([TODAY]);
  });

  it("treats the overdue of the partner like the own", () => {
    const own = chore("x", { kind: "occasional", dueDate: "2026-11-05" });
    const theirs = chore(
      "x",
      { kind: "occasional", dueDate: "2026-11-05" },
      { kind: "person", person: "partner" },
    );
    const [mine] = lists([own]).todo;
    const [partners] = lists([theirs]).todo;
    expect(mine).toMatchObject({ date: "2026-11-05", done: false });
    expect(Object.keys(partners ?? {})).toEqual(Object.keys(mine ?? {}));
    expect(partners).toEqual({ ...mine, responsible: "partner" });
  });

  it("does not repeat an overdue occurrence in the window", () => {
    const { todo, rows } = lists([chore("d", daily)]);
    expect(dates(todo)).not.toContain(TODAY);
    expect(dates(rows)[0]).toBe(TODAY);
  });

  it("marks the ticked off occurrences of the window", () => {
    const done = [{ choreId: "d", occurrenceDate: TODAY }];
    const { rows } = lists([chore("d", daily)], "today", "all", done);
    expect(rows.map((row) => row.done)).toEqual([true]);
  });
});
