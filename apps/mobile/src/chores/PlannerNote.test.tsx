// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { pl } from "../i18n/pl";
import {
  openRow,
  press,
  setup,
  show,
  typeInto,
  useSodium,
} from "./planner-test-support";

const form = pl.planner.form;
const ME = { kind: "person", person: "me" } as const;

useSodium();
afterEach(cleanup);

describe("the note and the reminder of a chore", () => {
  it("are added with the chore and shown in its row", async () => {
    const { platform, chores } = await setup(false);
    show(platform);
    await press(pl.planner.empty.add);
    typeInto(form.title, "Zmywanie");
    typeInto(form.note, "Dwa razy");
    typeInto(form.reminder, "08:30");
    await press(form.kinds.daily, "radio");
    await press(form.save);
    await screen.findByRole("button", { name: pl.planner.add });
    expect(await chores.list()).toMatchObject([
      { title: "Zmywanie", note: "Dwa razy", reminder: "08:30" },
    ]);
    expect((await screen.findAllByText("Przypomnienie 08:30")).length).toBe(
      1 + (await screen.findAllByText("Dwa razy")).length - 1,
    );
    const row = await screen.findAllByRole("button", {
      name: /^Zmywanie, .*Przypomnienie 08:30, Dwa razy/,
    });
    expect(row.length).toBeGreaterThan(0);
  });

  it("block the save with a bad time", async () => {
    const { platform, chores } = await setup(false);
    show(platform);
    await press(pl.planner.empty.add);
    typeInto(form.title, "Zmywanie");
    typeInto(form.reminder, "25:00");
    await press(form.save);
    expect((await screen.findByRole("alert")).textContent).toBe(
      form.errors.reminder,
    );
    typeInto(form.reminder, "");
    typeInto(form.note, "x".repeat(501));
    await press(form.save);
    expect((await screen.findByRole("alert")).textContent).toBe(
      form.errors.noteTooLong,
    );
    expect(await chores.list()).toEqual([]);
  });

  it("are edited and cleared", async () => {
    const { platform, chores } = await setup(false);
    await chores.add({
      title: "Zmywanie",
      rule: { kind: "daily" },
      assignment: ME,
      note: "Stara",
      reminder: "07:00",
    });
    show(platform);
    await openRow("Zmywanie");
    expect(screen.getByDisplayValue("Stara")).toBeTruthy();
    typeInto(form.note, "");
    typeInto(form.reminder, "21:15");
    await press(form.save);
    await screen.findByRole("button", { name: pl.planner.add });
    expect(await chores.list()).toMatchObject([
      { note: null, reminder: "21:15" },
    ]);
    expect(screen.queryByText("Stara")).toBeNull();
  });
});
