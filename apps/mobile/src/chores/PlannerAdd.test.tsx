// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { pl } from "../i18n/pl";
import {
  press,
  setup,
  show,
  typeInto,
  useSodium,
} from "./planner-test-support";

const form = pl.planner.form;

useSodium();
afterEach(cleanup);

const save = async () => {
  await press(form.save);
  await screen.findByRole("button", { name: pl.planner.add });
};

describe("adding a chore", () => {
  it("needs only a title, from the empty screen", async () => {
    const { platform, chores } = await setup(false);
    show(platform);
    fireEvent.click(
      await screen.findByRole("button", { name: pl.planner.empty.add }),
    );
    expect(screen.getByRole("heading", { name: form.addTitle })).toBeTruthy();
    // Without a pair nobody is asked who or how visible.
    expect(screen.queryByRole("radiogroup", { name: form.who })).toBeNull();
    expect(
      screen.queryByRole("radiogroup", { name: form.visibility }),
    ).toBeNull();
    typeInto(form.title, "Podlać kwiaty");
    await save();
    expect(await chores.list()).toMatchObject([
      {
        title: "Podlać kwiaty",
        rule: { kind: "occasional" },
        assignment: { kind: "person", person: "me" },
        shared: false,
      },
    ]);
    expect(screen.queryByRole("heading", { name: form.addTitle })).toBeNull();
  });

  it("refreshes the list without a reload and offers adding", async () => {
    const { platform } = await setup(false);
    show(platform);
    await press(pl.planner.empty.add);
    typeInto(form.title, "Zmywanie");
    await press(form.kinds.daily, "radio");
    await save();
    expect((await screen.findAllByText("Zmywanie")).length).toBeGreaterThan(0);
  });

  it("asks about the title, rule and the rest of the form", async () => {
    const { platform, chores } = await setup(false);
    show(platform);
    await press(pl.planner.empty.add);
    await press(form.save);
    expect(screen.getByText(form.errors.titleEmpty)).toBeTruthy();
    typeInto(form.title, "x".repeat(81));
    await press(form.save);
    expect(screen.getByText(form.errors.titleTooLong)).toBeTruthy();
    typeInto(form.title, "Sprzątanie");
    await press(form.kinds.everyNDays, "radio");
    typeInto(form.interval, "3");
    typeInto(form.startDate, "2026-11-12");
    await press(form.kinds.weekdays, "radio");
    await press(form.save);
    expect(screen.getByText(form.errors.rule)).toBeTruthy();
    await press(form.weekdays["2"], "checkbox");
    await press(form.weekdays["5"], "checkbox");
    await press(form.weekdays["2"], "checkbox");
    await press(form.kinds.monthly, "radio");
    typeInto(form.dayOfMonth, "15");
    await press(form.kinds.occasional, "radio");
    typeInto(form.dueDate, "2026-12-24");
    await save();
    expect(await chores.list()).toMatchObject([
      { rule: { kind: "occasional", dueDate: "2026-12-24" } },
    ]);
  });

  it("saves the rule of every kind", async () => {
    const { platform, chores } = await setup(false);
    show(platform);
    await press(pl.planner.empty.add);
    typeInto(form.title, "Co trzy dni");
    await press(form.kinds.everyNDays, "radio");
    typeInto(form.interval, "3");
    await save();
    await press(pl.planner.add);
    typeInto(form.title, "Dni");
    await press(form.kinds.weekdays, "radio");
    await press(form.weekdays["2"], "checkbox");
    await press(form.weekdays["5"], "checkbox");
    await press(form.weekdays["2"], "checkbox");
    await save();
    await press(pl.planner.add);
    typeInto(form.title, "Miesiąc");
    await press(form.kinds.monthly, "radio");
    typeInto(form.dayOfMonth, "15");
    await save();
    expect((await chores.list()).map((chore) => chore.rule)).toEqual([
      { kind: "everyNDays", interval: 3, startDate: "2026-11-11" },
      { kind: "weekdays", weekdays: [5] },
      { kind: "monthly", dayOfMonth: 15 },
    ]);
  });

  it("closes the form without saving", async () => {
    const { platform, chores } = await setup(false);
    show(platform);
    await press(pl.planner.empty.add);
    typeInto(form.title, "Nic");
    await press(form.cancel);
    expect(await screen.findByText(pl.planner.empty.text)).toBeTruthy();
    expect(await chores.list()).toEqual([]);
  });

  it("says so when the chore is not saved", async () => {
    const { platform, chores } = await setup(false);
    chores.add = () => Promise.reject(new Error("broken"));
    show(platform);
    await press(pl.planner.empty.add);
    typeInto(form.title, "Nic");
    await press(form.save);
    expect(await screen.findByText(form.errors.save)).toBeTruthy();
  });

  it("asks about who and visibility in a pair; private stays here", async () => {
    const { platform, chores } = await setup(true);
    show(platform);
    await press(pl.planner.empty.add);
    typeInto(form.title, "Zakupy");
    await press(form.whoOptions.both, "radio");
    await press(form.visibilityOptions.private, "radio");
    await save();
    await press(pl.planner.add);
    typeInto(form.title, "Pranie");
    await press(form.whoOptions.partner, "radio");
    await save();
    expect(await chores.list()).toMatchObject([
      { title: "Zakupy", assignment: { kind: "both" }, shared: false },
      {
        title: "Pranie",
        assignment: { kind: "person", person: "partner" },
        shared: true,
      },
    ]);
  });
});
