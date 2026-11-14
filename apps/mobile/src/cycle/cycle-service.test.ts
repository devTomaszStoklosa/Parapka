import { describe, expect, it, vi } from "vitest";

import {
  createCycleSettingsRepository,
  type CycleSettings,
} from "../data/cycle-settings";
import { createMemoryDatabase } from "../data/memory-database";
import { createCycleRepository } from "./cycle-repository";
import { createCycleService } from "./cycle-service";
import { PeriodValidationError } from "./period-validation";
import { createWellbeingRepository } from "./wellbeing-repository";
import {
  WellbeingValidationError,
  type WellbeingEntry,
} from "./wellbeing-validation";

const TODAY = "2026-11-14";
const clock = { nowMs: () => new Date(2026, 10, 14, 12).getTime() };

const known: CycleSettings = {
  unknown: false,
  lastPeriodStart: "2026-11-01",
  cycleLength: 30,
  periodLength: 4,
};
const dontKnow: CycleSettings = {
  unknown: true,
  lastPeriodStart: null,
  cycleLength: 28,
  periodLength: 5,
};

async function setup(settings?: CycleSettings) {
  const database = createMemoryDatabase();
  if (settings) await createCycleSettingsRepository(database).save(settings);
  return createCycleService({
    clock,
    repository: createCycleRepository(database),
    wellbeing: createWellbeingRepository(database),
  });
}

const period = (id: string, startDate: string, endDate: string | null) => ({
  id,
  startDate,
  endDate,
});

describe("today", () => {
  it("is the local date of the clock", async () => {
    expect((await setup()).today()).toBe(TODAY);
  });
});

describe("first entry from the onboarding (criterion 1)", () => {
  it("gives one ongoing entry, also on the second read", async () => {
    const cycle = await setup(known);
    const first = [period("seed", "2026-11-01", null)];
    expect(await cycle.periods()).toEqual(first);
    expect(await cycle.periods()).toEqual(first);
  });

  it("gives no entries and no forecast when the user does not know", async () => {
    const cycle = await setup(dontKnow);
    expect(await cycle.periods()).toEqual([]);
    expect(await cycle.forecast(TODAY)).toBeNull();
  });
});

describe("forecast", () => {
  it("uses 28 and 5 days with low confidence for a user who does not know", async () => {
    const cycle = await setup(dontKnow);
    await cycle.savePeriod(period("a", "2026-11-01", null));
    expect(await cycle.forecast(TODAY)).toEqual({
      nextStart: "2026-11-29",
      rangeStart: "2026-11-27",
      rangeEnd: "2026-12-01",
      cycleLength: 28,
      cycleLengthSource: "config",
      confidence: "low",
      isEstimate: true,
    });
  });

  it("uses the given length before 3 full cycles", async () => {
    const cycle = await setup(known);
    expect(await cycle.forecast(TODAY)).toMatchObject({
      nextStart: "2026-12-01",
      cycleLength: 30,
      cycleLengthSource: "config",
      isEstimate: true,
    });
  });

  it("averages the last 6 cycles and ignores the older ones", async () => {
    const cycle = await setup(known);
    await cycle.deletePeriod("seed");
    const starts = [
      "2026-04-07",
      "2026-05-17",
      "2026-06-14",
      "2026-07-12",
      "2026-08-09",
      "2026-09-06",
      "2026-10-04",
      "2026-11-01",
    ];
    for (const [i, start] of starts.entries()) {
      await cycle.savePeriod(period(`p${String(i)}`, start, null));
    }
    expect(await cycle.forecast(TODAY)).toMatchObject({
      nextStart: "2026-11-29",
      cycleLength: 28,
      cycleLengthSource: "history",
      isEstimate: true,
    });
  });
});

describe("savePeriod", () => {
  it.each([
    ["in the future", period("a", "2026-11-15", null)],
    ["ending before the start", period("a", "2026-11-05", "2026-11-04")],
    ["longer than 10 days", period("a", "2026-10-01", "2026-10-12")],
    ["overlapping", period("a", "2026-11-01", "2026-11-03")],
  ])("rejects an entry %s and saves nothing", async (_reason, entry) => {
    const cycle = await setup(known);
    await expect(cycle.savePeriod(entry)).rejects.toThrow(
      PeriodValidationError,
    );
    expect(await cycle.periods()).toEqual([period("seed", "2026-11-01", null)]);
  });

  it("recalculates the forecast after a new entry, an edit and a delete", async () => {
    const cycle = await setup(known);
    const listener = vi.fn();
    cycle.subscribe(listener);
    await cycle.savePeriod(period("a", "2026-10-03", "2026-10-07"));
    expect(await cycle.forecast(TODAY)).toMatchObject({
      nextStart: "2026-12-01",
      cycleLength: 30,
    });
    await cycle.savePeriod(period("seed", "2026-11-04", null));
    expect(await cycle.forecast(TODAY)).toMatchObject({
      nextStart: "2026-12-04",
    });
    await cycle.deletePeriod("seed");
    expect(await cycle.forecast(TODAY)).toMatchObject({
      nextStart: "2026-11-02",
    });
    expect(listener).toHaveBeenCalledTimes(3);
  });
});

describe("phaseOn", () => {
  it("passes the ongoing period as the typical length", async () => {
    const cycle = await setup(known);
    expect(await cycle.phaseOn("2026-11-04", TODAY)).toMatchObject({
      phase: "menstruation",
      confidence: "low",
    });
    expect(await cycle.phaseOn("2026-11-05", TODAY)).toMatchObject({
      phase: "follicular",
    });
  });

  it("passes the saved days of the period", async () => {
    const cycle = await setup(known);
    await cycle.savePeriod(period("seed", "2026-11-01", "2026-11-02"));
    expect(await cycle.phaseOn("2026-11-02", TODAY)).toMatchObject({
      phase: "menstruation",
    });
    expect(await cycle.phaseOn("2026-11-03", TODAY)).toMatchObject({
      phase: "follicular",
    });
  });

  it("passes the unknown configuration", async () => {
    const cycle = await setup(dontKnow);
    await cycle.savePeriod(period("a", "2026-11-01", null));
    expect(await cycle.phaseOn("2026-11-03", TODAY)).toMatchObject({
      phase: "menstruation",
      confidence: "low",
    });
  });

  it("is null before the first start and without any start", async () => {
    const cycle = await setup(known);
    expect(await cycle.phaseOn("2026-10-31", TODAY)).toBeNull();
    expect(await (await setup(dontKnow)).phaseOn(TODAY, TODAY)).toBeNull();
  });
});

describe("well-being reminder", () => {
  it("is off by default and can be changed", async () => {
    const cycle = await setup(known);
    expect((await cycle.profile()).wellbeingReminder).toBe(false);
    await cycle.setWellbeingReminder(true);
    expect((await cycle.profile()).wellbeingReminder).toBe(true);
  });
});

const wellbeing = (date: string, energy = 3): WellbeingEntry => ({
  date,
  energy,
  mood: 4,
  tension: 2,
  desire: 5,
  tags: ["cramps"],
  note: "  note ",
});

describe("wellbeing", () => {
  it("saves one trimmed entry per day, replaces it and deletes it", async () => {
    const cycle = await setup();
    await cycle.saveWellbeing(wellbeing("2026-11-14"));
    expect(await cycle.wellbeingOn("2026-11-14")).toEqual({
      ...wellbeing("2026-11-14"),
      note: "note",
    });
    await cycle.saveWellbeing(wellbeing("2026-11-14", 1));
    expect((await cycle.wellbeingOn("2026-11-14"))?.energy).toBe(1);
    await cycle.deleteWellbeing("2026-11-14");
    expect(await cycle.wellbeingOn("2026-11-14")).toBeNull();
  });

  it("rejects a future date and invalid data without saving", async () => {
    const cycle = await setup();
    await expect(cycle.saveWellbeing(wellbeing("2026-11-15"))).rejects.toThrow(
      WellbeingValidationError,
    );
    await expect(
      cycle.saveWellbeing({ ...wellbeing("2026-11-13"), mood: 6 }),
    ).rejects.toThrow(WellbeingValidationError);
    expect(await cycle.wellbeingForHints("2026-01-01", TODAY)).toEqual([]);
  });

  it("gives the engine only the date, energy and mood of the range", async () => {
    const cycle = await setup();
    for (const day of ["11", "12", "13", "14"]) {
      await cycle.saveWellbeing(wellbeing(`2026-11-${day}`));
    }
    expect(await cycle.wellbeingForHints("2026-11-12", "2026-11-14")).toEqual(
      ["12", "13", "14"].map((day) => ({
        date: `2026-11-${day}`,
        energy: 3,
        mood: 4,
      })),
    );
  });

  it("informs about every save and delete", async () => {
    const cycle = await setup();
    const listener = vi.fn();
    const stop = cycle.subscribeWellbeing(listener);
    await cycle.saveWellbeing(wellbeing("2026-11-14"));
    await cycle.deleteWellbeing("2026-11-14");
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    await cycle.saveWellbeing(wellbeing("2026-11-14"));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
