import { expect, it, vi } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import type { Profile } from "../data/profile";
import { createProfileRepository } from "../data/profile-repository";
import {
  CONSENT_TEXT_VERSION,
  defaultConsent,
  type ConsentProfile,
} from "./consent-model";
import { createConsentRepository } from "./consent-repository";

async function setup(cycle: ConsentProfile["cycle"] = "yes") {
  const database = createMemoryDatabase();
  const profiles = createProfileRepository(database);
  await profiles.save({ cycle, shareGoalsWithPartner: false } as Profile);
  const time = { now: 1_000 };
  const consent = createConsentRepository({
    database,
    clock: { nowMs: () => time.now },
    profiles,
  });
  return { consent, time };
}

const defaults = defaultConsent({ cycle: "yes", shareGoalsWithPartner: false });

it("does not sync and shares nothing without a consent", async () => {
  const { consent } = await setup();
  expect(await consent.current()).toBeNull();
  expect(await consent.canSync()).toBe(false);
  expect(await consent.isShared("SHARED_CHORES")).toBe(false);
});

it("saves the states with the date and the version of the text", async () => {
  const { consent } = await setup();
  await consent.save(defaults);
  expect(await consent.current()).toEqual({
    states: defaults,
    savedAtMs: 1_000,
    textVersion: CONSENT_TEXT_VERSION,
  });
  expect(await consent.canSync()).toBe(true);
});

it("shares only the categories that are on", async () => {
  const { consent } = await setup();
  await consent.save(defaults);
  expect(await consent.isShared("SHARED_CHORES")).toBe(true);
  expect(await consent.isShared("CHECKIN")).toBe(false);
});

it("never shares cycle hints of a person without a cycle", async () => {
  const { consent } = await setup("no");
  await consent.save({ ...defaults, CYCLE_HINTS: true });
  expect(await consent.isShared("CYCLE_HINTS")).toBe(false);
});

it("saves a change with a new date and tells the listeners", async () => {
  const { consent, time } = await setup();
  await consent.save(defaults);
  const listener = vi.fn();
  const stop = consent.onChange(listener);
  time.now = 5_000;
  await consent.setCategory("CHECKIN", true);

  const record = await consent.current();
  expect(record?.states.CHECKIN).toBe(true);
  expect(record?.savedAtMs).toBe(5_000);
  expect(listener).toHaveBeenCalledExactlyOnceWith({
    category: "CHECKIN",
    enabled: true,
  });
  expect(await consent.isShared("CHECKIN")).toBe(true);

  stop();
  await consent.setCategory("CHECKIN", false);
  expect(listener).toHaveBeenCalledOnce();
});

it("ignores a change that keeps the state", async () => {
  const { consent, time } = await setup();
  await consent.save(defaults);
  const listener = vi.fn();
  consent.onChange(listener);
  time.now = 5_000;
  await consent.setCategory("SHARED_CHORES", true);
  expect(listener).not.toHaveBeenCalled();
  expect((await consent.current())?.savedAtMs).toBe(1_000);
});

it("refuses to change a consent that was not given", async () => {
  const { consent } = await setup();
  await expect(consent.setCategory("CHECKIN", true)).rejects.toThrow();
});

it("reports a saved consent as allowing the sync", async () => {
  const { consent } = await setup();
  await consent.save(defaults);
  expect(await consent.canSync()).toBe(true);
});

it("keeps the other categories and the text version when one changes", async () => {
  const { consent, time } = await setup();
  await consent.save(defaults);
  time.now = 7_000;
  await consent.setCategory("CHECKIN", true);

  const record = await consent.current();
  expect(record?.states).toEqual({ ...defaults, CHECKIN: true });
  expect(record?.textVersion).toBe(CONSENT_TEXT_VERSION);
});

it("stores the date of the change when a category is switched", async () => {
  const { consent, time } = await setup();
  await consent.save(defaults);
  time.now = 9_000;
  await consent.setCategory("CHECKIN", true);

  expect((await consent.current())?.savedAtMs).toBe(9_000);
});

it("does not allow the sync before any consent is saved", async () => {
  const { consent } = await setup();
  expect(await consent.canSync()).toBe(false);
});

it("keeps the sync allowed after a category is switched", async () => {
  const { consent } = await setup();
  await consent.save(defaults);
  await consent.setCategory("CHECKIN", true);
  expect(await consent.canSync()).toBe(true);
});

it("tells the listeners when the first consent is saved, until they stop", async () => {
  const { consent } = await setup();
  const listener = vi.fn();
  const stop = consent.onSaved(listener);
  await consent.save(defaults);
  expect(listener).toHaveBeenCalledOnce();
  stop();
  await consent.save(defaults);
  expect(listener).toHaveBeenCalledOnce();
});

it("removes the saved consent", async () => {
  const { consent } = await setup();
  await consent.save(defaults);
  await consent.clear();
  expect(await consent.current()).toBeNull();
  expect(await consent.canSync()).toBe(false);
});

it("tells the listeners of every instance on the database when the consent is cleared", async () => {
  const database = createMemoryDatabase();
  const profiles = createProfileRepository(database);
  const make = () =>
    createConsentRepository({ database, clock: { nowMs: () => 1 }, profiles });
  const first = make();
  const second = make();
  await first.save(defaults);
  const listener = vi.fn();
  const stop = first.onCleared(listener);
  await second.clear();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(await first.current()).toBeNull();
  stop();
  await second.clear();
  expect(listener).toHaveBeenCalledTimes(1);
});
