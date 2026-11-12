import { ChoreValidationError } from "@parapka/domain";
import { describe, expect, it, vi } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { createPairedDevices } from "../sync/sync-test-support";
import { createScheduleRepository } from "./schedule-repository";

const SUNDAY = { weekday: 7, hour: 19, minute: 0 } as const;
const WEDNESDAY = { weekday: 3, hour: 19, minute: 0 } as const;

async function paired() {
  const { a } = await createPairedDevices();
  return {
    a,
    schedule: createScheduleRepository({
      database: a.database,
      pairs: a.pairs,
    }),
  };
}

describe("schedule repository", () => {
  it("is Sunday 19:00 without a record", async () => {
    const { schedule } = await paired();
    expect(await schedule.get()).toEqual(SUNDAY);
  });

  it("is Sunday 19:00 without a pair, and set throws", async () => {
    const schedule = createScheduleRepository({
      database: createMemoryDatabase(),
      pairs: { activePair: () => Promise.resolve(null) },
    });
    expect(await schedule.get()).toEqual(SUNDAY);
    await expect(schedule.set(WEDNESDAY)).rejects.toThrow(ChoreValidationError);
  });

  it("keeps the schedule that was set", async () => {
    const { schedule } = await paired();
    await schedule.set({ weekday: 3, hour: 7, minute: 5 });
    expect(await schedule.get()).toEqual({ weekday: 3, hour: 7, minute: 5 });
  });

  it.each([
    { weekday: 0, hour: 19, minute: 0 },
    { weekday: 8, hour: 19, minute: 0 },
    { weekday: 1.5, hour: 19, minute: 0 },
    { weekday: 3, hour: 24, minute: 0 },
    { weekday: 3, hour: 19, minute: 60 },
    { weekday: 3, hour: -1, minute: 0 },
  ])("rejects an invalid schedule %j", async (invalid) => {
    const { schedule } = await paired();
    await expect(
      schedule.set(invalid as unknown as typeof SUNDAY),
    ).rejects.toThrow(ChoreValidationError);
    expect(await schedule.get()).toEqual(SUNDAY);
  });

  it("keeps only the changed fields as pending", async () => {
    const { a, schedule } = await paired();
    await schedule.set(WEDNESDAY);
    await schedule.set(WEDNESDAY);
    const record = (await a.database.get("couple-settings", "current")) as {
      pending: { fields: unknown };
    };
    expect(record.pending.fields).toEqual({ checkInDay: 3 });
  });

  it("tells the listeners about a change", async () => {
    const { schedule } = await paired();
    const listener = vi.fn();
    const stop = schedule.subscribe(listener);
    await schedule.set(WEDNESDAY);
    await schedule.forget();
    stop();
    await schedule.set(SUNDAY);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
