import { describe, expect, it } from "vitest";

import {
  createCycleSettingsRepository,
  parseCycleSettings,
  UNKNOWN_CYCLE_SETTINGS,
} from "./cycle-settings";
import { createMemoryDatabase } from "./memory-database";

const valid = {
  lastPeriodStart: "2026-10-01",
  cycleLength: 28,
  periodLength: 5,
};

describe("parseCycleSettings", () => {
  it("accepts values in range", () => {
    expect(parseCycleSettings(valid)).toEqual({ ...valid, unknown: false });
  });

  it("accepts the edges of the ranges", () => {
    expect(
      parseCycleSettings({ ...valid, cycleLength: 21, periodLength: 2 }),
    ).not.toBeNull();
    expect(
      parseCycleSettings({ ...valid, cycleLength: 45, periodLength: 10 }),
    ).not.toBeNull();
  });

  it.each([
    { cycleLength: 20 },
    { cycleLength: 46 },
    { cycleLength: 28.5 },
    { periodLength: 1 },
    { periodLength: 11 },
    { periodLength: Number.NaN },
    { lastPeriodStart: "" },
    { lastPeriodStart: "2026-13-40" },
    { lastPeriodStart: "yesterday" },
  ])("rejects %j", (patch) => {
    expect(parseCycleSettings({ ...valid, ...patch })).toBeNull();
  });
});

describe("parseCycleSettings with today", () => {
  it("accepts today and the past", () => {
    expect(parseCycleSettings(valid, "2026-10-01")).not.toBeNull();
    expect(parseCycleSettings(valid, "2026-11-09")).not.toBeNull();
  });

  it("rejects a start of the last period in the future", () => {
    expect(parseCycleSettings(valid, "2026-09-30")).toBeNull();
    expect(
      parseCycleSettings(
        { ...valid, lastPeriodStart: "2099-01-01" },
        "2026-11-09",
      ),
    ).toBeNull();
  });
});

describe("UNKNOWN_CYCLE_SETTINGS", () => {
  it("keeps the defaults", () => {
    expect(UNKNOWN_CYCLE_SETTINGS).toEqual({
      unknown: true,
      lastPeriodStart: null,
      cycleLength: 28,
      periodLength: 5,
    });
  });
});

describe("CycleSettingsRepository", () => {
  it("reads null before anything is saved", async () => {
    const repo = createCycleSettingsRepository(createMemoryDatabase());
    expect(await repo.get()).toBeNull();
  });

  it("reads the saved settings", async () => {
    const repo = createCycleSettingsRepository(createMemoryDatabase());
    const settings = parseCycleSettings(valid);
    if (!settings) throw new Error("valid settings expected");
    await repo.save(settings);
    expect(await repo.get()).toEqual(settings);
  });
});
