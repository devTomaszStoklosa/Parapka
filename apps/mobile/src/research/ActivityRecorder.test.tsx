// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { AppState } from "react-native";
import { afterEach, expect, it, vi } from "vitest";

import { t } from "../i18n";
import { LockGate } from "../lock/LockGate";
import { createPinStore } from "../lock/pin-store";
import { createMemoryDatabase } from "../data/memory-database";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { PlatformProvider, type Platform } from "../platform/context";
import { createWebSodium } from "../platform/web-sodium";
import { ActivityRecorder } from "./ActivityRecorder";
import { createActivityLog } from "./activity-log";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

function setup() {
  const database = createMemoryDatabase();
  const time = { now: new Date(2026, 10, 14, 12).getTime() };
  const clock = { nowMs: () => time.now };
  const platform = { database, clock } as unknown as Platform;
  let listener: (state: string) => void = () => undefined;
  const remove = vi.fn();
  vi.spyOn(AppState, "addEventListener").mockImplementation((_type, cb) => {
    listener = cb as (state: string) => void;
    return { remove };
  });
  return {
    database,
    platform,
    time,
    remove,
    emit: (state: string) => {
      listener(state);
    },
    days: () => createActivityLog(database).days(),
  };
}

it("records the day on mount and again when the app returns on a new day", async () => {
  const { platform, time, emit, days, remove } = setup();
  const view = render(
    <PlatformProvider platform={platform}>
      <ActivityRecorder />
    </PlatformProvider>,
  );
  await flush();
  expect(await days()).toEqual(["2026-11-14"]);
  time.now = new Date(2026, 10, 15, 7).getTime();
  emit("background");
  await flush();
  expect(await days()).toEqual(["2026-11-14"]);
  emit("active");
  await flush();
  expect(await days()).toEqual(["2026-11-14", "2026-11-15"]);
  view.unmount();
  expect(remove).toHaveBeenCalled();
});

it("drops a failed write", async () => {
  const { platform, database, days } = setup();
  vi.spyOn(database, "list").mockRejectedValue(new Error("disk"));
  render(
    <PlatformProvider platform={platform}>
      <ActivityRecorder />
    </PlatformProvider>,
  );
  await flush();
  vi.restoreAllMocks();
  expect(await days()).toEqual([]);
});

it("records only after the PIN unlocks the app", async () => {
  const { platform, days } = setup();
  const sodium = await createWebSodium();
  const { database, clock } = platform;
  await createPinStore({ database, sodium, clock }).setPin("123456");
  render(
    <PlatformProvider platform={platform}>
      <LockGate
        database={database}
        keyStore={createMemoryKeyStore()}
        sodium={sodium}
        clock={clock}
      >
        <ActivityRecorder />
      </LockGate>
    </PlatformProvider>,
  );
  await flush();
  expect(screen.getByText(t("lock.pin.unlockTitle"))).toBeTruthy();
  expect(await days()).toEqual([]);
  "123456".split("").forEach((digit, index) => {
    fireEvent.change(screen.getByLabelText(`Cyfra ${String(index + 1)} z 6`), {
      target: { value: digit },
    });
  });
  await flush();
  expect(await days()).toEqual(["2026-11-14"]);
});
