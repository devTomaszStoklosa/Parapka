import { describe, expect, it } from "vitest";

import {
  changedFields,
  defaultFormState,
  formStateOf,
  toChoreInput,
  type FormState,
} from "./chore-form-model";
import type { StoredChore } from "./chore-repository";

const TODAY = "2026-11-11";
const base = (changes: Partial<FormState>): FormState => ({
  ...defaultFormState(TODAY),
  title: "Zmywanie",
  ...changes,
});
const input = (changes: Partial<FormState>) => toChoreInput(base(changes));

describe("the form model", () => {
  it("needs only a title: occasional, without a date, mine", () => {
    expect(input({})).toEqual({
      input: {
        title: "Zmywanie",
        rule: { kind: "occasional" },
        assignment: { kind: "person", person: "me" },
        note: null,
        reminder: null,
      },
    });
  });

  it("turns the note and the reminder into null when empty", () => {
    expect(input({ note: "  ", reminder: " " })).toMatchObject({
      input: { note: null, reminder: null },
    });
    expect(input({ note: "Dwa razy", reminder: " 08:30 " })).toMatchObject({
      input: { note: "Dwa razy", reminder: "08:30" },
    });
  });

  it("says what is wrong with the note and the reminder", () => {
    expect(input({ note: "x".repeat(501) })).toEqual({
      error: "planner.form.errors.noteTooLong",
    });
    expect(input({ note: "x".repeat(500) })).toHaveProperty("input");
    for (const reminder of ["24:00", "8:30", "12:60", "rano"]) {
      expect(input({ reminder })).toEqual({
        error: "planner.form.errors.reminder",
      });
    }
  });

  it("fills the form with the note and the reminder of a chore", () => {
    const chore: StoredChore = {
      id: "c",
      title: "T",
      rule: { kind: "daily" },
      assignment: { kind: "person", person: "me" },
      note: "Notka",
      reminder: "07:15",
      shared: true,
    };
    expect(formStateOf(chore, TODAY)).toMatchObject({
      note: "Notka",
      reminder: "07:15",
    });
    expect(
      formStateOf({ ...chore, note: null, reminder: null }, TODAY),
    ).toMatchObject({
      note: "",
      reminder: "",
    });
  });

  it("saves only the note or the reminder that changed", () => {
    const chore = {
      title: "T",
      rule: { kind: "daily" } as const,
      assignment: { kind: "anyone" } as const,
    };
    expect(changedFields(chore, { ...chore, note: null })).toEqual({});
    expect(
      changedFields(
        { ...chore, note: "a", reminder: null },
        { ...chore, note: null, reminder: "08:00" },
      ),
    ).toEqual({ note: null, reminder: "08:00" });
  });

  it("says what is wrong with the title", () => {
    expect(input({ title: "  " })).toEqual({
      error: "planner.form.errors.titleEmpty",
    });
    expect(input({ title: "x".repeat(81) })).toEqual({
      error: "planner.form.errors.titleTooLong",
    });
    expect(input({ title: "x".repeat(80) })).toHaveProperty("input");
  });

  it("builds every kind of rule", () => {
    const rule = (changes: Partial<FormState>) =>
      (input(changes) as { input: { rule: unknown } }).input.rule;
    expect(rule({ kind: "daily" })).toEqual({ kind: "daily" });
    expect(rule({ kind: "everyNDays", interval: "3" })).toEqual({
      kind: "everyNDays",
      interval: 3,
      startDate: TODAY,
    });
    expect(rule({ kind: "weekdays", weekdays: [2, 5] })).toEqual({
      kind: "weekdays",
      weekdays: [2, 5],
    });
    expect(rule({ kind: "monthly", dayOfMonth: "31" })).toEqual({
      kind: "monthly",
      dayOfMonth: 31,
    });
    expect(rule({ dueDate: "2026-12-24" })).toEqual({
      kind: "occasional",
      dueDate: "2026-12-24",
    });
  });

  it("rejects a rule that does not hold", () => {
    const bad = { error: "planner.form.errors.rule" };
    expect(input({ kind: "weekdays" })).toEqual(bad);
    expect(input({ kind: "everyNDays", interval: "x" })).toEqual(bad);
    expect(input({ kind: "everyNDays", startDate: "jutro" })).toEqual(bad);
    expect(input({ kind: "monthly", dayOfMonth: "32" })).toEqual(bad);
    expect(input({ dueDate: "2026-02-30" })).toEqual(bad);
  });

  it("builds every assignment", () => {
    const who = (changes: Partial<FormState>) =>
      (input(changes) as { input: { assignment: unknown } }).input.assignment;
    expect(who({ who: "partner" })).toEqual({
      kind: "person",
      person: "partner",
    });
    expect(who({ who: "both" })).toEqual({ kind: "both" });
    expect(who({ who: "anyone" })).toEqual({ kind: "anyone" });
    expect(who({ who: "alternating" })).toEqual({
      kind: "alternating",
      firstPerson: "me",
      startDate: TODAY,
    });
  });

  it("fills the form from a chore and builds the same chore back", () => {
    const chores: StoredChore[] = [
      { rule: { kind: "daily" }, assignment: { kind: "anyone" } },
      {
        rule: { kind: "everyNDays", interval: 4, startDate: "2026-11-01" },
        assignment: { kind: "person", person: "partner" },
      },
      { rule: { kind: "weekdays", weekdays: [1, 4] }, assignment: ME() },
      {
        rule: { kind: "monthly", dayOfMonth: 15 },
        assignment: { kind: "both" },
      },
      {
        rule: { kind: "occasional", dueDate: "2026-12-01" },
        assignment: {
          kind: "alternating",
          firstPerson: "partner",
          startDate: "2026-11-02",
        },
      },
      { rule: { kind: "occasional" }, assignment: ME() },
    ].map((part, index) => ({
      id: String(index),
      title: "Obowiązek",
      shared: index % 2 === 0,
      ...part,
    })) as StoredChore[];
    for (const chore of chores) {
      const state = formStateOf(chore, TODAY);
      expect(state.visibility).toBe(chore.shared ? "shared" : "private");
      expect(toChoreInput(state)).toEqual({
        input: {
          title: chore.title,
          rule: chore.rule,
          assignment: chore.assignment,
          note: null,
          reminder: null,
        },
      });
    }
  });

  it("lists only the fields that changed", () => {
    const before = {
      title: "A",
      rule: { kind: "daily" } as const,
      assignment: ME(),
    };
    expect(changedFields(before, { ...before })).toEqual({});
    expect(changedFields(before, { ...before, title: "B" })).toEqual({
      title: "B",
    });
    expect(
      changedFields(before, {
        ...before,
        rule: { kind: "monthly", dayOfMonth: 2 },
        assignment: { kind: "both" },
      }),
    ).toEqual({
      rule: { kind: "monthly", dayOfMonth: 2 },
      assignment: { kind: "both" },
    });
  });
});

function ME() {
  return { kind: "person", person: "me" } as const;
}
