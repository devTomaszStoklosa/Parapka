// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { saveForm } from "../cycle/cycle-screen-test-support";
import { cycleOf } from "../cycle/cycle-screen-test-support";
import {
  createCycleSettingsRepository,
  UNKNOWN_CYCLE_SETTINGS,
} from "../data/cycle-settings";
import { setup, useSodium } from "../chores/planner-test-support";
import { pl } from "../i18n/pl";
import { PlatformProvider, type Platform } from "../platform/context";
import { NotificationSettings } from "./NotificationSettings";
import { createNotificationSettingsRepository } from "./notification-settings";

useSodium();
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const texts = pl.notifications.settings;
const types = texts.types;

async function open(options: { paired?: boolean; cycle?: boolean } = {}) {
  const { platform } = await setup(options.paired ?? false);
  if (options.cycle) {
    await saveForm(platform, "neutral");
    await createCycleSettingsRepository(platform.database).save(
      UNKNOWN_CYCLE_SETTINGS,
    );
  }
  render(
    <PlatformProvider platform={platform}>
      <NotificationSettings />
    </PlatformProvider>,
  );
  await screen.findByText(texts.title);
  return platform;
}

const toggle = (name: string) =>
  screen.getByRole<HTMLInputElement>("switch", { name });
const stored = (platform: Platform) =>
  createNotificationSettingsRepository(platform.database).get();

it("shows the states after the installation (FR-NOT-05)", async () => {
  await open({ paired: true, cycle: true });
  expect(toggle(texts.discreet.label).checked).toBe(true);
  expect(toggle(types["chore-reminder"]).checked).toBe(true);
  expect(toggle(types.checkin).checked).toBe(true);
  expect(toggle(types["partner-hint"]).checked).toBe(true);
  expect(toggle(types.wellbeing).checked).toBe(false);
  expect(toggle(types["handover-taken"]).checked).toBe(true);
  expect(toggle(types["checkin-results"]).checked).toBe(true);
  expect(toggle(types["pair-status"]).checked).toBe(true);
  const value = (label: string) =>
    screen.getByRole<HTMLInputElement>("textbox", { name: label }).value;
  expect(value(texts.times.quietFrom)).toBe("22:00");
  expect(value(texts.times.quietTo)).toBe("07:00");
  expect(value(texts.times.hintTime)).toBe("08:00");
});

it("hides the wellbeing without the cycle panel and the hint without a pair", async () => {
  await open();
  expect(screen.queryByRole("switch", { name: types.wellbeing })).toBeNull();
  expect(
    screen.queryByRole("switch", { name: types["partner-hint"] }),
  ).toBeNull();
  expect(
    screen.queryByRole("textbox", { name: texts.times.hintTime }),
  ).toBeNull();
});

it.each([
  ["chore-reminder"],
  ["checkin"],
  ["partner-hint"],
  ["wellbeing"],
  ["handover-taken"],
  ["checkin-results"],
  ["pair-status"],
] as const)("saves the switch of %s", async (id) => {
  const platform = await open({ paired: true, cycle: true });
  const before = (await stored(platform)).enabled[id];
  fireEvent.click(toggle(types[id]));
  await vi.waitFor(async () => {
    expect((await stored(platform)).enabled[id]).toBe(!before);
  });
  await vi.waitFor(() => {
    expect(toggle(types[id]).checked).toBe(!before);
  });
});

it("saves the discreet mode", async () => {
  const platform = await open();
  fireEvent.click(toggle(texts.discreet.label));
  await vi.waitFor(async () => {
    expect((await stored(platform)).discreet).toBe(false);
  });
});

it("keeps the wellbeing in step with the cycle panel", async () => {
  const platform = await open({ cycle: true });
  await act(() => cycleOf(platform).setWellbeingReminder(true));
  await vi.waitFor(() => {
    expect(toggle(types.wellbeing).checked).toBe(true);
  });
  const cycleListener = vi.fn();
  cycleOf(platform).subscribe(cycleListener);
  fireEvent.click(toggle(types.wellbeing));
  await vi.waitFor(async () => {
    expect((await cycleOf(platform).profile()).wellbeingReminder).toBe(false);
  });
  expect(cycleListener).toHaveBeenCalled();
});

it("saves the wellbeing even without a stored cycle record", async () => {
  const platform = await open({ cycle: true });
  await platform.database.delete("cycle-settings", "me");
  fireEvent.click(toggle(types.wellbeing));
  await vi.waitFor(async () => {
    expect((await cycleOf(platform).profile()).wellbeingReminder).toBe(true);
  });
});

it("tells the subscribers about every change", async () => {
  const platform = await open();
  const listener = vi.fn();
  createNotificationSettingsRepository(platform.database).subscribe(listener);
  fireEvent.click(toggle(types.checkin));
  await vi.waitFor(() => {
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

const time = (label: string) =>
  screen.getByRole<HTMLInputElement>("textbox", { name: label });
const save = () => {
  fireEvent.click(screen.getByRole("button", { name: texts.times.save }));
};

it.each(["25:00", "7"])(
  "rejects the hour %s and saves nothing",
  async (bad) => {
    const platform = await open();
    fireEvent.change(time(texts.times.quietTo), { target: { value: bad } });
    save();
    expect((await screen.findByRole("alert")).textContent).toBe(
      texts.times.invalid,
    );
    expect((await stored(platform)).quietHours.to).toBe("07:00");
  },
);

it("saves a valid hour on confirmation", async () => {
  const platform = await open({ paired: true });
  fireEvent.change(time(texts.times.quietFrom), { target: { value: "23:00" } });
  fireEvent.change(time(texts.times.hintTime), { target: { value: "09:30" } });
  expect((await stored(platform)).quietHours.from).toBe("22:00");
  save();
  await vi.waitFor(async () => {
    const settings = await stored(platform);
    expect(settings.quietHours.from).toBe("23:00");
    expect(settings.partnerHintTime).toBe("09:30");
  });
  expect(screen.queryByRole("alert")).toBeNull();
});

it("shows the failure of saving the hours", async () => {
  const platform = await open();
  vi.spyOn(platform.database, "put").mockRejectedValue(new Error("x"));
  save();
  expect((await screen.findByRole("alert")).textContent).toBe(
    texts.times.failed,
  );
});

it("shows the failure of saving a switch", async () => {
  const platform = await open();
  vi.spyOn(platform.database, "put").mockRejectedValue(new Error("x"));
  fireEvent.click(toggle(types.checkin));
  expect((await screen.findByRole("alert")).textContent).toBe(texts.failed);
});
