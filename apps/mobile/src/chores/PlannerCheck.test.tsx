// @vitest-environment jsdom
import { formatHlc } from "@parapka/sync";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { pl } from "../i18n/pl";
import { colors, contrastRatio } from "../ui/theme";
import {
  NOW,
  action,
  press,
  receiveProfile,
  setup,
  show,
  useSodium,
} from "./planner-test-support";

useSodium();
afterEach(cleanup);

const ME = { kind: "person", person: "me" } as const;
const DAILY = { kind: "daily" } as const;
const DAY = 24 * 3_600_000;
const FAILED = pl.planner.actions.failed;

const partnerCompletion = (choreId: string) => ({
  choreId,
  occurrenceDate: "2026-11-11",
  completedBy: "device-partner",
  completedAt: formatHlc({
    physical: new Date(2026, 10, 12, 18, 5).getTime(),
    counter: 0,
    deviceId: "device-partner",
  }),
});

describe("ticking off an occurrence", () => {
  it("ticks off one occurrence and shows who and when", async () => {
    const { platform, chores, completions } = await setup(false);
    await chores.add({ title: "Zmywanie", rule: DAILY, assignment: ME });
    show(platform);
    await press(action(pl.planner.actions.done));
    expect(
      await screen.findByText("Zrobił(a): Ty, 11.11.2026 12:00"),
    ).toBeTruthy();
    expect(await completions.list()).toHaveLength(1);
    expect(
      screen.getByLabelText(
        /^Zmywanie, .*, Zrobił\(a\): Ty, 11\.11\.2026 12:00$/,
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: action(pl.planner.actions.done) }),
    ).toBeNull();
  });

  it("ticks off each occurrence on its own", async () => {
    const { platform, chores, completions } = await setup(false);
    await chores.add({
      title: "Śmieci",
      rule: { kind: "weekdays", weekdays: [1, 4] },
      assignment: ME,
    });
    show(platform);
    await press(pl.planner.views.week, "radio");
    const buttons = await screen.findAllByRole("button", {
      name: action(pl.planner.actions.done),
    });
    expect(buttons).toHaveLength(2);
    buttons[0]?.click();
    await waitFor(async () => {
      expect(await completions.list()).toEqual([
        expect.objectContaining({ occurrenceDate: "2026-11-12" }),
      ]);
    });
    expect(
      await screen.findAllByRole("button", {
        name: action(pl.planner.actions.done),
      }),
    ).toHaveLength(1);
  });

  it("labels each button with the title and the date", async () => {
    const { platform, chores } = await setup(false);
    await chores.add({
      title: "Śmieci",
      rule: { kind: "weekdays", weekdays: [1, 4] },
      assignment: ME,
    });
    show(platform);
    await press(pl.planner.views.week, "radio");
    const done = pl.planner.actions.done;
    expect(
      await screen.findByRole("button", {
        name: `${done}: Śmieci, 12.11.2026`,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: `${done}: Śmieci, 16.11.2026` }),
    ).toBeTruthy();
    expect(screen.getAllByText(done)).toHaveLength(2);
  });

  it("draws the action buttons with a border that sets them apart", async () => {
    const { platform, chores } = await setup(false);
    await chores.add({ title: "Zmywanie", rule: DAILY, assignment: ME });
    show(platform);
    const button = await screen.findByRole("button", {
      name: action(pl.planner.actions.done),
    });
    const style = getComputedStyle(button);
    expect(style.borderTopWidth).toBe("1px");
    expect(style.borderTopColor).not.toBe("");
    expect(contrastRatio(colors.border, colors.surface)).toBeGreaterThan(3);
  });

  it("labels the undo button with the title and the date", async () => {
    const { platform, chores, completions } = await setup(false);
    const { id } = await chores.add({
      title: "Zmywanie",
      rule: DAILY,
      assignment: ME,
    });
    await completions.complete(id, "2026-11-11");
    show(platform);
    expect(
      await screen.findByRole("button", {
        name: `${pl.planner.actions.undo}: Zmywanie, 11.11.2026`,
      }),
    ).toBeTruthy();
  });

  it("removes a ticked off overdue occurrence from the to-do list", async () => {
    const { platform, chores, time } = await setup(false);
    time.now = NOW - 40 * DAY;
    await chores.add({
      title: "Stare",
      rule: { kind: "occasional", dueDate: "2026-11-05" },
      assignment: ME,
    });
    time.now = NOW;
    show(platform);
    await screen.findByRole("heading", { name: pl.planner.todo });
    await press(action(pl.planner.actions.done));
    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: pl.planner.todo }),
      ).toBeNull();
    });
  });

  it("undoes the check-off of this device", async () => {
    const { platform, chores, completions } = await setup(false);
    const { id } = await chores.add({
      title: "Zmywanie",
      rule: DAILY,
      assignment: ME,
    });
    await completions.complete(id, "2026-11-11");
    show(platform);
    await press(action(pl.planner.actions.undo));
    expect(
      await screen.findByRole("button", {
        name: action(pl.planner.actions.done),
      }),
    ).toBeTruthy();
    expect(await completions.list()).toEqual([]);
  });

  it("names the partner and gives no undo for their check-off", async () => {
    const { platform, chores, completions } = await setup(true);
    const { id } = await chores.add({
      title: "Zmywanie",
      rule: DAILY,
      assignment: ME,
    });
    completions.list = () => Promise.resolve([partnerCompletion(id)]);
    await receiveProfile(platform, "Ola");
    show(platform);
    expect(
      await screen.findByText("Zrobił(a): Ola, 12.11.2026 18:05"),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: action(pl.planner.actions.undo) }),
    ).toBeNull();
  });

  it("calls the partner Partner while the name is missing", async () => {
    const { platform, chores, completions } = await setup(true);
    const { id } = await chores.add({
      title: "Zmywanie",
      rule: DAILY,
      assignment: ME,
    });
    completions.list = () => Promise.resolve([partnerCompletion(id)]);
    show(platform);
    expect(
      await screen.findByText("Zrobił(a): Partner, 12.11.2026 18:05"),
    ).toBeTruthy();
  });

  it("says so when ticking off, then clears it after a success", async () => {
    const { platform, chores, completions } = await setup(false);
    await chores.add({ title: "Zmywanie", rule: DAILY, assignment: ME });
    const complete = completions.complete.bind(completions);
    completions.complete = () => Promise.reject(new Error("broken"));
    show(platform);
    await press(action(pl.planner.actions.done));
    expect(await screen.findByText(FAILED)).toBeTruthy();
    completions.complete = complete;
    await press(action(pl.planner.actions.done));
    await waitFor(() => {
      expect(screen.queryByText(FAILED)).toBeNull();
    });
  });

  it("says so when undoing fails", async () => {
    const { platform, chores, completions } = await setup(false);
    const { id } = await chores.add({
      title: "Zmywanie",
      rule: DAILY,
      assignment: ME,
    });
    await completions.complete(id, "2026-11-11");
    completions.undo = () => Promise.reject(new Error("broken"));
    show(platform);
    await press(action(pl.planner.actions.undo));
    expect(await screen.findByText(FAILED)).toBeTruthy();
  });
});
