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

describe("editing a chore", () => {
  it("opens with the values of the chore and saves only the changes", async () => {
    const { platform, chores } = await setup(false);
    const { id } = await chores.add({
      title: "Zmywanie",
      rule: { kind: "daily" },
      assignment: ME,
    });
    show(platform);
    await openRow("Zmywanie");
    expect(screen.getByRole("heading", { name: form.editTitle })).toBeTruthy();
    expect(screen.getByDisplayValue("Zmywanie")).toBeTruthy();
    typeInto(form.title, "Mycie naczyń");
    await press(form.save);
    await screen.findByRole("button", { name: pl.planner.add });
    expect(await chores.list()).toMatchObject([
      { id, title: "Mycie naczyń", rule: { kind: "daily" }, assignment: ME },
    ]);
    const record = (await platform.database.get("chores", id)) as {
      pending: { fields: Record<string, unknown> };
    };
    expect(Object.keys(record.pending.fields).sort()).toEqual([
      "assignment",
      "rule",
      "title",
    ]);
  });

  it("changes the rule and, in a pair, who is responsible", async () => {
    const { platform, chores } = await setup(true);
    await chores.add({
      title: "Zakupy",
      rule: { kind: "weekdays", weekdays: [1, 4] },
      assignment: ME,
    });
    show(platform);
    await openRow("Zakupy");
    expect(screen.getByText(form.visibilityNow.shared)).toBeTruthy();
    expect(
      screen.queryByRole("radiogroup", { name: form.visibility }),
    ).toBeNull();
    await press(form.whoOptions.both, "radio");
    await press(form.kinds.monthly, "radio");
    typeInto(form.dayOfMonth, "10");
    await press(form.save);
    await screen.findByRole("button", { name: pl.planner.add });
    expect(await chores.list()).toMatchObject([
      {
        rule: { kind: "monthly", dayOfMonth: 10 },
        assignment: { kind: "both" },
      },
    ]);
  });

  it("shows a private chore of a pair as private", async () => {
    const { platform, chores } = await setup(true);
    await chores.add(
      { title: "Sekret", rule: { kind: "daily" }, assignment: ME },
      { private: true },
    );
    show(platform);
    await openRow("Sekret");
    expect(screen.getByText(form.visibilityNow.private)).toBeTruthy();
  });

  it("closes without a change", async () => {
    const { platform, chores } = await setup(false);
    await chores.add({
      title: "Zmywanie",
      rule: { kind: "daily" },
      assignment: ME,
    });
    show(platform);
    await openRow("Zmywanie");
    typeInto(form.title, "Inaczej");
    await press(form.cancel);
    expect(await screen.findAllByText("Zmywanie")).not.toHaveLength(0);
    expect(await chores.list()).toMatchObject([{ title: "Zmywanie" }]);
  });

  it("says so when the change is not saved", async () => {
    const { platform, chores } = await setup(false);
    await chores.add({
      title: "Zmywanie",
      rule: { kind: "daily" },
      assignment: ME,
    });
    chores.edit = () => Promise.reject(new Error("broken"));
    show(platform);
    await openRow("Zmywanie");
    await press(form.save);
    expect(await screen.findByText(form.errors.save)).toBeTruthy();
  });
});
