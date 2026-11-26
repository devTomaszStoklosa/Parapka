// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NOW,
  action,
  openRow,
  press,
  receiveProfile,
  setup,
  useSodium,
} from "../chores/planner-test-support";
import { colors, MIN_TOUCH_TARGET } from "../ui/theme";
import { pl } from "../i18n/pl";
import { PlatformProvider, type Platform } from "../platform/context";
import { TodayChores } from "./TodayChores";

useSodium();
afterEach(cleanup);

const DAILY = { kind: "daily" } as const;
const ME = { kind: "person", person: "me" } as const;
const DAY = 24 * 3_600_000;
const OPEN = pl.todayChores.openPlanner;

const show = (platform: Platform, onOpenPlanner = vi.fn()) => {
  const view = render(
    <PlatformProvider platform={platform}>
      <TodayChores onOpenPlanner={onOpenPlanner} />
    </PlatformProvider>,
  );
  return Object.assign(onOpenPlanner, { view });
};

describe("the look of the card", () => {
  it("does not use the danger color for an overdue chore of the partner", async () => {
    const { platform, chores, time } = await setup(true);
    time.now = NOW - 40 * DAY;
    await chores.add({
      title: "Stare",
      rule: { kind: "occasional", dueDate: "2026-11-05" },
      assignment: { kind: "person", person: "partner" },
    });
    time.now = NOW;
    const { view } = show(platform);
    const header = await screen.findByText(pl.planner.todo);
    expect(screen.getByText("Stare")).toBeTruthy();
    const danger = colors.danger.toLowerCase();
    const rgb = "rgb(176, 0, 32)";
    for (const html of [view.container.innerHTML, header.outerHTML]) {
      expect(html.toLowerCase()).not.toContain(danger);
      expect(html).not.toContain(rgb);
    }
    expect(getComputedStyle(header).color).not.toBe(rgb);
  });

  it("draws the done mark round", async () => {
    const { platform, chores } = await setup(false);
    await chores.add({ title: "Zmywanie", rule: DAILY, assignment: ME });
    show(platform);
    const button = await screen.findByRole("button", {
      name: action(pl.planner.actions.done),
    });
    const mark = button.firstElementChild as HTMLElement;
    expect(getComputedStyle(mark).borderTopLeftRadius).toBe("999px");
  });

  it("keeps the button of the planner a named 44 px target", async () => {
    const { platform } = await setup(false);
    show(platform);
    const button = await screen.findByRole("button", { name: OPEN });
    expect(
      parseFloat(getComputedStyle(button).minHeight),
    ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });
});

describe("the chores of today", () => {
  it("lists the overdue and today's occurrences with the partner's name", async () => {
    const { platform, chores, time } = await setup(true);
    time.now = NOW - 40 * DAY;
    await chores.add({
      title: "Stare",
      rule: { kind: "occasional", dueDate: "2026-11-05" },
      assignment: ME,
    });
    time.now = NOW;
    await chores.add({
      title: "Zmywanie",
      rule: DAILY,
      assignment: { kind: "person", person: "partner" },
    });
    await receiveProfile(platform, "Ola");
    show(platform);
    expect(await screen.findByText(pl.todayChores.title)).toBeTruthy();
    expect(screen.getByText("Stare")).toBeTruthy();
    expect(screen.getByText("Ola · 11.11.2026")).toBeTruthy();
    expect(screen.getByText(pl.planner.todo)).toBeTruthy();
  });

  it('has no "to do" section without overdue occurrences', async () => {
    const { platform, chores } = await setup(true);
    await chores.add({ title: "Zmywanie", rule: DAILY, assignment: ME });
    show(platform);
    expect(await screen.findByText("Zmywanie")).toBeTruthy();
    expect(screen.queryByText(pl.planner.todo)).toBeNull();
    expect(screen.queryByText(pl.todayChores.today)).toBeNull();
  });

  it("heads today's occurrences when there are overdue ones", async () => {
    const { platform, chores, time } = await setup(true);
    time.now = NOW - 40 * DAY;
    await chores.add({
      title: "Stare",
      rule: { kind: "occasional", dueDate: "2026-11-05" },
      assignment: ME,
    });
    time.now = NOW;
    await chores.add({ title: "Zmywanie", rule: DAILY, assignment: ME });
    show(platform);
    expect(await screen.findByText(pl.todayChores.today)).toBeTruthy();
    expect(screen.getByText("Zmywanie")).toBeTruthy();
  });

  it("ticks off, undoes and releases an occurrence", async () => {
    const { platform, chores, completions } = await setup(true);
    await chores.add({ title: "Zmywanie", rule: DAILY, assignment: ME });
    show(platform);
    await press(action(pl.planner.actions.done));
    await press(action(pl.planner.actions.undo));
    await waitFor(async () => {
      expect(await completions.list()).toEqual([]);
    });
    await press(action(pl.planner.actions.release));
    await waitFor(() => {
      expect(
        screen.queryByRole("button", {
          name: action(pl.planner.actions.release),
        }),
      ).toBeNull();
    });
  });

  it("says so when an action fails", async () => {
    const { platform, chores, completions } = await setup(false);
    await chores.add({ title: "Zmywanie", rule: DAILY, assignment: ME });
    completions.complete = () => Promise.reject(new Error("broken"));
    show(platform);
    await press(action(pl.planner.actions.done));
    expect(await screen.findByText(pl.planner.actions.failed)).toBeTruthy();
  });

  it("opens the planner by touching a row and by the button", async () => {
    const { platform, chores } = await setup(false);
    await chores.add({ title: "Zmywanie", rule: DAILY, assignment: ME });
    const onOpenPlanner = show(platform);
    await openRow("Zmywanie");
    expect(onOpenPlanner).toHaveBeenCalledTimes(1);
    await press(OPEN);
    expect(onOpenPlanner).toHaveBeenCalledTimes(2);
  });

  it("refreshes after a change made elsewhere", async () => {
    const { platform, chores } = await setup(false);
    show(platform);
    expect(await screen.findByText(pl.todayChores.none)).toBeTruthy();
    await chores.add({ title: "Zmywanie", rule: DAILY, assignment: ME });
    expect(await screen.findByText("Zmywanie")).toBeTruthy();
    expect(screen.queryByText(pl.todayChores.none)).toBeNull();
  });

  it("shows a short text and the button without chores", async () => {
    const { platform } = await setup(false);
    show(platform);
    expect(await screen.findByText(pl.todayChores.none)).toBeTruthy();
    expect(screen.getByRole("button", { name: OPEN })).toBeTruthy();
  });

  it("shows nothing while loading", async () => {
    const { platform } = await setup(false);
    show(platform);
    expect(screen.queryByText(pl.todayChores.title)).toBeNull();
    await screen.findByText(pl.todayChores.title);
  });

  it("says so when the chores did not load", async () => {
    const { platform, chores } = await setup(false);
    chores.list = () => Promise.reject(new Error("broken"));
    show(platform);
    expect(await screen.findByText(pl.planner.failed)).toBeTruthy();
    expect(screen.getByRole("button", { name: OPEN })).toBeTruthy();
  });
});
