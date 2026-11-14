import { describe, expect, it, vi } from "vitest";

import {
  createCycleSettingsRepository,
  type CycleSettings,
} from "../data/cycle-settings";
import { createMemoryDatabase } from "../data/memory-database";
import { createCycleRepository } from "./cycle-repository";

const onboarded: CycleSettings = {
  unknown: false,
  lastPeriodStart: "2026-11-01",
  cycleLength: 30,
  periodLength: 4,
};

async function setup(settings?: CycleSettings) {
  const database = createMemoryDatabase();
  if (settings) await createCycleSettingsRepository(database).save(settings);
  return createCycleRepository(database);
}

describe("profile", () => {
  it("has the defaults and no reminder before the onboarding", async () => {
    const repo = await setup();
    expect(await repo.profile()).toEqual({
      typicalCycleLength: 28,
      typicalPeriodLength: 5,
      unknown: true,
      wellbeingReminder: false,
    });
  });

  it("reads the settings of the onboarding", async () => {
    const repo = await setup(onboarded);
    expect(await repo.profile()).toEqual({
      typicalCycleLength: 30,
      typicalPeriodLength: 4,
      unknown: false,
      wellbeingReminder: false,
    });
  });

  it("changes the reminder, keeps the rest and tells the listeners", async () => {
    const repo = await setup(onboarded);
    const listener = vi.fn();
    repo.subscribe(listener);
    await repo.setWellbeingReminder(true);
    expect(await repo.profile()).toMatchObject({
      typicalCycleLength: 30,
      wellbeingReminder: true,
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("saves the reminder before the onboarding on the defaults", async () => {
    const repo = await setup();
    await repo.setWellbeingReminder(true);
    expect(await repo.profile()).toMatchObject({
      unknown: true,
      wellbeingReminder: true,
    });
  });
});

describe("periods", () => {
  it("adds the entry of the onboarding once", async () => {
    const repo = await setup(onboarded);
    const first = [{ id: "seed", startDate: "2026-11-01", endDate: null }];
    expect(await repo.periods()).toEqual(first);
    expect(await repo.periods()).toEqual(first);
  });

  it("does not bring back a deleted entry", async () => {
    const repo = await setup(onboarded);
    await repo.periods();
    await repo.deletePeriod("seed");
    expect(await repo.periods()).toEqual([]);
  });

  it("is empty without a last period or without settings", async () => {
    const unknown = await setup({
      ...onboarded,
      unknown: true,
      lastPeriodStart: null,
    });
    expect(await unknown.periods()).toEqual([]);
    expect(await (await setup()).periods()).toEqual([]);
  });

  it("does not add the entry when there already are some", async () => {
    const database = createMemoryDatabase();
    const repo = createCycleRepository(database);
    await repo.putPeriod({
      id: "a",
      startDate: "2026-10-03",
      endDate: "2026-10-07",
    });
    await createCycleSettingsRepository(database).save(onboarded);
    expect((await repo.periods()).map((p) => p.id)).toEqual(["a"]);
  });

  it("saves, orders, replaces and deletes entries and tells the listeners", async () => {
    const repo = await setup();
    const listener = vi.fn();
    repo.subscribe(listener);
    await repo.putPeriod({ id: "b", startDate: "2026-10-30", endDate: null });
    await repo.putPeriod({
      id: "a",
      startDate: "2026-10-01",
      endDate: "2026-10-05",
    });
    await repo.putPeriod({
      id: "b",
      startDate: "2026-10-30",
      endDate: "2026-11-02",
    });
    expect(await repo.periods()).toEqual([
      { id: "a", startDate: "2026-10-01", endDate: "2026-10-05" },
      { id: "b", startDate: "2026-10-30", endDate: "2026-11-02" },
    ]);
    await repo.deletePeriod("a");
    expect((await repo.periods()).map((p) => p.id)).toEqual(["b"]);
    expect(listener).toHaveBeenCalledTimes(4);
  });
});
