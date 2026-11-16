import { currentCheckinWindow } from "@parapka/domain";
import { afterEach, expect, it, vi } from "vitest";

import * as checkinWiring from "../checkin/wiring";
import { createSingleDevice } from "../chores/chore-test-support";
import * as choresWiring from "../chores/wiring";
import * as cycleWiring from "../cycle/wiring";
import type { Platform } from "../platform/context";
import { enqueueNotification } from "./delivery";
import { createNotificationSettingsRepository } from "./notification-settings";
import { collectSources } from "./sources";

afterEach(() => {
  vi.restoreAllMocks();
});

const at = (day: number, hour: number) =>
  new Date(2026, 10, day, hour).getTime();

async function setup(paired: boolean) {
  const device = createSingleDevice();
  vi.spyOn(choresWiring, "wireChores").mockReturnValue({
    chores: device.chores,
    completions: { list: () => Promise.resolve([]) },
  } as unknown as ReturnType<typeof choresWiring.wireChores>);
  vi.spyOn(checkinWiring, "wireCheckin").mockReturnValue({
    checkin: {
      current: () =>
        Promise.resolve({
          window: currentCheckinWindow({
            year: 2026,
            month: 11,
            day: 16,
            hour: 9,
            minute: 0,
          }),
          paired,
          status: "open",
        }),
    },
  } as unknown as ReturnType<typeof checkinWiring.wireCheckin>);
  vi.spyOn(cycleWiring, "wireCycleHints").mockReturnValue({
    received: {
      today: () =>
        Promise.resolve({ forDate: "2026-11-16", status: "scheduled" }),
    },
  } as unknown as ReturnType<typeof cycleWiring.wireCycleHints>);
  const platform = { database: device.database } as unknown as Platform;
  const settings = await createNotificationSettingsRepository(
    device.database,
  ).get();
  return { platform, settings };
}

const range = { fromMs: at(15, 0), toMs: at(17, 0) };

it("collects the check-in, the hint and the queue from the local data", async () => {
  const { platform, settings } = await setup(true);
  await enqueueNotification(platform.database, {
    id: "event:1",
    type: "pair-status",
    atMs: at(16, 10),
    title: { key: "notifications.discreet.title" },
    body: { key: "notifications.discreet.body" },
  });
  const sources = await collectSources(platform, settings, range);
  expect(sources.flat().map(({ id }) => id)).toEqual([
    "checkin:2026-W46:first",
    "checkin:2026-W46:repeat",
    "partner-hint:2026-11-16",
    "event:1",
  ]);
});

it("collects no check-in reminder without a pair", async () => {
  const { platform, settings } = await setup(false);
  const sources = await collectSources(platform, settings, range);
  expect(sources.flat().map(({ id }) => id)).toEqual([
    "partner-hint:2026-11-16",
  ]);
});
