import { DEFAULT_CHECKIN_SCHEDULE } from "@parapka/domain";
import { afterEach, expect, it, vi } from "vitest";

import { createConsentRepository } from "../consent/consent-repository";
import { defaultConsent, NO_PROFILE } from "../consent/consent-model";
import { wireConsent } from "../consent/wiring";
import { createCheckinService } from "../checkin/checkin-service";
import * as checkinWiring from "../checkin/wiring";
import { createSingleDevice } from "../chores/chore-test-support";
import * as choresWiring from "../chores/wiring";
import * as cycleWiring from "../cycle/wiring";
import { createCyclePanel } from "../cycle/cycle-panel";
import { createWellbeingRepository } from "../cycle/wellbeing-repository";
import {
  createCycleSettingsRepository,
  UNKNOWN_CYCLE_SETTINGS,
} from "../data/cycle-settings";
import type { Profile } from "../data/profile";
import { createProfileRepository } from "../data/profile-repository";
import type { Platform } from "../platform/context";
import { enqueueNotification } from "./delivery";
import { createNotificationSettingsRepository } from "./notification-settings";
import { collectSources } from "./sources";

afterEach(() => {
  vi.restoreAllMocks();
});

const at = (day: number, hour: number) =>
  new Date(2026, 10, day, hour).getTime();

async function setup(paired: boolean, shared = true, partnerFilled = false) {
  const device = createSingleDevice();
  vi.spyOn(choresWiring, "wireChores").mockReturnValue({
    chores: device.chores,
    completions: { list: () => Promise.resolve([]) },
  } as unknown as ReturnType<typeof choresWiring.wireChores>);
  const none = () => () => undefined;
  const checkin = createCheckinService({
    clock: { nowMs: () => new Date(2026, 10, 16, 9).getTime() },
    pairs: { activePair: () => Promise.resolve(paired ? {} : null) },
    schedule: {
      get: () => Promise.resolve(DEFAULT_CHECKIN_SCHEDULE),
      subscribe: none,
    },
    answers: { get: () => Promise.resolve(null) },
    sealed: { partnerFilled: () => Promise.resolve(partnerFilled) },
    reveal: { get: () => Promise.resolve(null) },
    windowEnd: { sweep: () => Promise.resolve() },
  } as unknown as Parameters<typeof createCheckinService>[0]);
  vi.spyOn(checkinWiring, "wireCheckin").mockReturnValue({
    checkin,
  } as unknown as ReturnType<typeof checkinWiring.wireCheckin>);
  vi.spyOn(cycleWiring, "wireCycleHints").mockReturnValue({
    received: {
      today: () =>
        Promise.resolve({ forDate: "2026-11-16", status: "scheduled" }),
    },
  } as unknown as ReturnType<typeof cycleWiring.wireCycleHints>);
  const platform = {
    database: device.database,
    clock: { nowMs: () => Date.now() },
  } as unknown as Platform;
  const { consent } = wireConsent(platform);
  await consent.save(defaultConsent(NO_PROFILE));
  await consent.setCategory("CHECKIN", shared);
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

it("collects no check-in reminder while the check-in is turned off", async () => {
  const { platform, settings } = await setup(true, false);
  const sources = await collectSources(platform, settings, range);
  expect(sources.flat().map(({ id }) => id)).toEqual([
    "partner-hint:2026-11-16",
  ]);
});

it("collects the same check-in reminders whether or not the partner filled in (FR-CHK-07)", async () => {
  const waiting = await setup(true, true, false);
  const filled = await setup(true, true, true);
  expect(await collectSources(filled.platform, filled.settings, range)).toEqual(
    await collectSources(waiting.platform, waiting.settings, range),
  );
});

const wellbeingIds = async (
  platform: Platform,
  settings: Awaited<ReturnType<typeof setup>>["settings"],
) =>
  (await collectSources(platform, settings, range))
    .flat()
    .filter(({ type }) => type === "wellbeing")
    .map(({ id }) => id);

const PROFILE: Profile = {
  name: "Ola",
  form: "feminine",
  adultConfirmed: true,
  relationshipTenure: "1-3",
  hasChildren: false,
  childrenCount: 0,
  goals: [],
  otherGoalText: null,
  shareGoalsWithPartner: false,
  cycle: "yes",
  pinDecision: "skipped",
};

/** A person with a cycle panel; with `reminder` the wellbeing reminder is on. */
async function withCycle(reminder: boolean) {
  const result = await setup(true);
  const { database } = result.platform;
  const profiles = createProfileRepository(database);
  await profiles.save(PROFILE);
  await createCycleSettingsRepository(database).save({
    ...UNKNOWN_CYCLE_SETTINGS,
    wellbeingReminder: reminder,
  });
  return { ...result, profiles };
}

it("collects no wellbeing reminder while the switch is off", async () => {
  const { platform, settings } = await withCycle(false);
  expect(await wellbeingIds(platform, settings)).toEqual([]);
});

it("collects no wellbeing reminder after the cycle panel is turned off", async () => {
  const { platform, settings, profiles } = await withCycle(true);
  const { database } = platform;
  const consent = createConsentRepository({
    database,
    clock: { nowMs: () => 1_000 },
    profiles,
  });
  await createCyclePanel({ database, profiles, consent }).disable();
  expect(await wellbeingIds(platform, settings)).toEqual([]);
});

it("collects no wellbeing reminder for a profile without a cycle", async () => {
  const { platform, settings, profiles } = await withCycle(true);
  await profiles.save({ ...PROFILE, cycle: "no" });
  expect(
    await createCycleSettingsRepository(platform.database).get(),
  ).toMatchObject({ wellbeingReminder: true });
  expect(await wellbeingIds(platform, settings)).toEqual([]);
});

it("collects the wellbeing reminder until the day has an entry, the rest unchanged", async () => {
  const { platform, settings } = await withCycle(true);
  const before = (await collectSources(platform, settings, range)).flat();
  expect(before.filter(({ id }) => id === "wellbeing:2026-11-16")).toHaveLength(
    1,
  );
  await createWellbeingRepository(platform.database).put({
    date: "2026-11-16",
    energy: 3,
    mood: 3,
    tension: 3,
    tags: [],
  });
  const after = (await collectSources(platform, settings, range)).flat();
  expect(after.filter(({ id }) => id === "wellbeing:2026-11-16")).toEqual([]);
  const others = (items: typeof before) =>
    items.filter(({ id }) => id !== "wellbeing:2026-11-16");
  expect(others(after)).toEqual(others(before));
});
