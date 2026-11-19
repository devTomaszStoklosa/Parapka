// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { pl } from "../i18n/pl";
import { cycleOf, setup, show, useSodium } from "./cycle-screen-test-support";

useSodium();
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const toggle = () =>
  screen.getByRole<HTMLInputElement>("switch", {
    name: pl.cycle.reminder.label,
  });

it("is off by default and saves the change", async () => {
  const { platform } = await setup(false);
  show(platform);
  await screen.findByText(pl.cycle.reminder.label);
  expect(toggle().checked).toBe(false);
  fireEvent.click(toggle());
  await vi.waitFor(async () => {
    expect((await cycleOf(platform).profile()).wellbeingReminder).toBe(true);
  });
  await vi.waitFor(() => {
    expect(toggle().checked).toBe(true);
  });
});

it("shows the error when saving fails", async () => {
  const { platform } = await setup(false);
  vi.spyOn(cycleOf(platform), "setWellbeingReminder").mockRejectedValue(
    new Error("x"),
  );
  show(platform);
  await screen.findByText(pl.cycle.reminder.label);
  fireEvent.click(toggle());
  expect((await screen.findByRole("alert")).textContent).toBe(
    pl.cycle.period.error.generic,
  );
});

it("switches by pressing the label or the hint and back", async () => {
  const { platform } = await setup(false);
  show(platform);
  await screen.findByText(pl.cycle.reminder.label);
  expect(
    screen.getAllByRole("switch", { name: pl.cycle.reminder.label }),
  ).toHaveLength(1);
  expect(
    screen.queryByRole("button", { name: pl.cycle.reminder.label }),
  ).toBeNull();
  const reminder = async () =>
    (await cycleOf(platform).profile()).wellbeingReminder;
  fireEvent.click(screen.getByText(pl.cycle.reminder.label));
  await vi.waitFor(async () => {
    expect(await reminder()).toBe(true);
  });
  await waitFor(() => {
    expect(toggle().checked).toBe(true);
  });
  fireEvent.click(screen.getByText(pl.cycle.reminder.label));
  await vi.waitFor(async () => {
    expect(await reminder()).toBe(false);
  });
  await waitFor(() => {
    expect(toggle().checked).toBe(false);
  });
  fireEvent.click(screen.getByText(pl.cycle.reminder.hint));
  await vi.waitFor(async () => {
    expect(await reminder()).toBe(true);
  });
});
