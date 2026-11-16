// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { AppState } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { currentCheckinWindow } from "@parapka/domain";

import { toLocalDateTime } from "../checkin/local-time";
import * as checkinWiring from "../checkin/wiring";
import { ME, createSingleDevice } from "../chores/chore-test-support";
import * as wiring from "../chores/wiring";
import * as cycleWiring from "../cycle/wiring";
import { t } from "../i18n";
import { LockGate } from "../lock/LockGate";
import { createPinStore } from "../lock/pin-store";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { createWebSodium } from "../platform/web-sodium";
import { PlatformProvider, type Platform } from "../platform/context";
import { createMemoryNotifier, type Notifier } from "../platform/notifier";
import { enqueueNotification } from "./delivery";
import { CHECK_MS, NotificationRunner } from "./NotificationRunner";
import { createNotificationSettingsRepository } from "./notification-settings";

const at = (hour: number, minute = 0, day = 16) =>
  new Date(2026, 10, day, hour, minute).getTime();

// 16 November 2026 is a Monday.
const MONDAY = { kind: "weekdays", weekdays: [1] } as const;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at(17, 59));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function setup(reminder = "18:00", permission?: Notifier) {
  const device = createSingleDevice();
  await device.chores.add({
    title: "Śmieci",
    rule: MONDAY,
    assignment: ME,
    reminder,
  });
  vi.spyOn(wiring, "wireChores").mockReturnValue({
    chores: device.chores,
    completions: { list: () => Promise.resolve([]) },
  } as unknown as ReturnType<typeof wiring.wireChores>);
  const pairing = { paired: false };
  vi.spyOn(checkinWiring, "wireCheckin").mockReturnValue({
    checkin: {
      current: () =>
        Promise.resolve({
          window: currentCheckinWindow(toLocalDateTime(Date.now())),
          paired: pairing.paired,
          status: "open",
        }),
    },
  } as never);
  vi.spyOn(cycleWiring, "wireCycleHints").mockReturnValue({
    received: { today: () => Promise.resolve(null) },
  } as never);
  const notifier = permission ?? createMemoryNotifier();
  const platform = {
    database: device.database,
    clock: { nowMs: () => Date.now() },
    notifier,
  } as unknown as Platform;
  let listener: (state: string) => void = () => undefined;
  const remove = vi.fn();
  vi.spyOn(AppState, "addEventListener").mockImplementation((_type, cb) => {
    listener = cb as (state: string) => void;
    return { remove };
  });
  const mount = () =>
    render(
      <PlatformProvider platform={platform}>
        <NotificationRunner />
      </PlatformProvider>,
    );
  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  return {
    device,
    pairing,
    platform,
    notifier: notifier as ReturnType<typeof createMemoryNotifier>,
    mount,
    advance,
    remove,
    emit: (state: string) =>
      act(async () => {
        listener(state);
        await vi.advanceTimersByTimeAsync(0);
      }),
  };
}

it("delivers the notification once after 18:00, also after a reload", async () => {
  const { notifier, mount, advance } = await setup();
  const view = mount();
  await advance(0);
  expect(notifier.shown).toEqual([]);
  await advance(CHECK_MS);
  expect(notifier.shown).toEqual([
    {
      title: "Parapka",
      body: "masz nowe przypomnienie",
      tag: expect.stringContaining("chore-reminder:") as string,
    },
  ]);
  await advance(3 * CHECK_MS);
  view.unmount();
  mount();
  await advance(CHECK_MS);
  expect(notifier.shown).toHaveLength(1);
});

it("shows the full text when the discreet mode is off", async () => {
  const { notifier, platform, mount, advance } = await setup("17:00");
  await createNotificationSettingsRepository(platform.database).set({
    discreet: false,
  });
  mount();
  await advance(0);
  expect(notifier.shown).toMatchObject([
    { title: "Obowiązek: Śmieci", body: "Zajrzyj do Parapki." },
  ]);
});

it("shows the banner without the permission of the browser", async () => {
  const notifier = createMemoryNotifier("denied");
  const { mount, advance } = await setup("17:00", notifier);
  mount();
  await advance(0);
  expect(notifier.shown).toEqual([]);
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.getByText("masz nowe przypomnienie")).toBeTruthy();
  const close = screen.getByText("Zamknij");
  await act(async () => {
    close.click();
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.queryByRole("alert")).toBeNull();
});

it("shows the banner when the platform has no notifier", async () => {
  const { platform, mount, advance } = await setup("17:00");
  delete platform.notifier;
  mount();
  await advance(0);
  expect(screen.getByRole("alert")).toBeTruthy();
});

it("delivers a reminder from the quiet hours only after 07:00", async () => {
  const { notifier, mount, advance } = await setup("23:00");
  vi.setSystemTime(at(22, 59));
  mount();
  await advance(16 * CHECK_MS);
  expect(notifier.shown).toEqual([]);
  vi.setSystemTime(at(6, 59, 17));
  await advance(CHECK_MS / 2);
  expect(notifier.shown).toEqual([]);
  vi.setSystemTime(at(7, 0, 17));
  await advance(CHECK_MS);
  expect(notifier.shown).toHaveLength(1);
});

it("delivers nothing for a type that is turned off", async () => {
  const { notifier, platform, mount, advance } = await setup("17:00");
  await createNotificationSettingsRepository(platform.database).set({
    enabled: { "chore-reminder": false },
  });
  mount();
  await advance(CHECK_MS);
  expect(notifier.shown).toEqual([]);
});

it("delivers the queued notifications of events with the schedule", async () => {
  const { notifier, platform, mount, advance } = await setup("19:00");
  await enqueueNotification(platform.database, {
    id: "event:1",
    type: "chore-reminder",
    atMs: at(17, 0),
    title: { key: "notifications.choreReminder.title" },
    body: { key: "notifications.choreReminder.body" },
  });
  mount();
  await advance(0);
  expect(notifier.shown).toHaveLength(1);
});

it("checks when the tab comes back to the front", async () => {
  const { notifier, mount, advance, emit } = await setup();
  mount();
  await advance(0);
  vi.setSystemTime(at(18, 5));
  await emit("background");
  expect(notifier.shown).toEqual([]);
  await emit("active");
  expect(notifier.shown).toHaveLength(1);
});

it("survives a failed check and tries again", async () => {
  const { device, notifier, mount, advance } = await setup("17:00");
  const list = vi
    .spyOn(device.chores, "list")
    .mockRejectedValueOnce(new Error("broken"));
  mount();
  await advance(0);
  expect(list).toHaveBeenCalledTimes(1);
  expect(notifier.shown).toEqual([]);
  await advance(CHECK_MS);
  expect(notifier.shown).toHaveLength(1);
});

it("stops checking after the unmount", async () => {
  const { device, mount, advance, remove } = await setup();
  const list = vi.spyOn(device.chores, "list");
  const view = mount();
  await advance(CHECK_MS);
  const calls = list.mock.calls.length;
  view.unmount();
  await advance(5 * CHECK_MS);
  expect(list.mock.calls.length).toBe(calls);
  expect(remove).toHaveBeenCalledTimes(1);
});

it("does not remember a result that arrives after the unmount", async () => {
  const { notifier, mount, advance } = await setup("17:00");
  const view = mount();
  view.unmount();
  await advance(0);
  expect(notifier.shown).toEqual([]);
  mount();
  await advance(0);
  expect(notifier.shown).toHaveLength(1);
});

it("delivers nothing in a locked app and once after the unlock", async () => {
  const { notifier, platform } = await setup();
  const sodium = await createWebSodium();
  const clock = platform.clock;
  const keyStore = createMemoryKeyStore();
  await keyStore.set("secret", Uint8Array.of(1));
  await createPinStore({ database: platform.database, sodium, clock }).setPin(
    "123456",
  );
  render(
    <PlatformProvider platform={platform}>
      <LockGate
        database={platform.database}
        keyStore={keyStore}
        sodium={sodium}
        clock={clock}
      >
        <NotificationRunner />
      </LockGate>
    </PlatformProvider>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3 * CHECK_MS);
  });
  expect(screen.getByText(t("lock.pin.unlockTitle"))).toBeTruthy();
  expect(notifier.shown).toEqual([]);
  expect(screen.queryByRole("alert")).toBeNull();
  "123456".split("").forEach((digit, index) => {
    fireEvent.change(screen.getByLabelText(`Cyfra ${String(index + 1)} z 6`), {
      target: { value: digit },
    });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(CHECK_MS);
  });
  expect(notifier.shown).toHaveLength(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3 * CHECK_MS);
  });
  expect(notifier.shown).toHaveLength(1);
});

it("does not start a check while the previous one is still running", async () => {
  const { device, mount, advance, emit } = await setup();
  let release: (value: never[]) => void = () => undefined;
  const list = vi
    .spyOn(device.chores, "list")
    .mockImplementationOnce(
      () => new Promise<never[]>((resolve) => (release = resolve)),
    );
  mount();
  await advance(0);
  await emit("active");
  expect(list).toHaveBeenCalledTimes(1);
  release([]);
  await advance(0);
});

it("delivers the reminder of the check-in without a word about the partner", async () => {
  const { notifier, pairing, platform, mount, advance } = await setup("19:00");
  pairing.paired = true;
  const settings = createNotificationSettingsRepository(platform.database);
  await settings.set({ discreet: false });
  mount();
  await advance(0);
  expect(notifier.shown).toMatchObject([
    { title: "Check-in", tag: "checkin:2026-W46:first" },
  ]);
});
