import { readFileSync } from "node:fs";

import { expect, it, vi } from "vitest";

import { createCycleSettingsRepository } from "../data/cycle-settings";
import { createMemoryDatabase } from "../data/memory-database";
import { createNotificationSettingsRepository } from "./notification-settings";
import { NOTIFICATION_TYPES } from "./notification-types";

const cycle = {
  unknown: true,
  lastPeriodStart: null,
  cycleLength: 28,
  periodLength: 5,
} as const;

function setup() {
  const db = createMemoryDatabase();
  return { db, repo: createNotificationSettingsRepository(db) };
}

it("returns the defaults without a record", async () => {
  const settings = await setup().repo.get();
  expect(settings.discreet).toBe(true);
  expect(settings.quietHours).toEqual({ from: "22:00", to: "07:00" });
  expect(settings.partnerHintTime).toBe("08:00");
  expect(settings.wellbeingTime).toBe("20:00");
  for (const type of NOTIFICATION_TYPES) {
    expect(settings.enabled[type.id]).toBe(type.defaultEnabled);
  }
});

it("turns every type off and on again", async () => {
  const { repo } = setup();
  for (const { id } of NOTIFICATION_TYPES.filter((t) => t.id !== "wellbeing")) {
    await repo.set({ enabled: { [id]: false } });
    expect((await repo.get()).enabled[id]).toBe(false);
    await repo.set({ enabled: { [id]: true } });
    expect((await repo.get()).enabled[id]).toBe(true);
  }
});

it("saves the other settings and keeps the rest", async () => {
  const { repo } = setup();
  await repo.set({ discreet: false, partnerHintTime: "09:30" });
  await repo.set({ quietHours: { from: "23:00", to: "06:00" } });
  await repo.set({ wellbeingTime: "21:15" });
  const settings = await repo.get();
  expect(settings).toMatchObject({
    discreet: false,
    partnerHintTime: "09:30",
    quietHours: { from: "23:00", to: "06:00" },
    wellbeingTime: "21:15",
  });
});

it("notifies the subscribers of a write until they unsubscribe", async () => {
  const { repo } = setup();
  const listener = vi.fn();
  const stop = repo.subscribe(listener);
  await repo.set({ discreet: false });
  expect(listener).toHaveBeenCalledTimes(1);
  stop();
  await repo.set({ discreet: true });
  expect(listener).toHaveBeenCalledTimes(1);
});

it.each([
  { partnerHintTime: "8:00" },
  { wellbeingTime: "24:00" },
  { quietHours: { from: "22:00", to: "7:00" } },
  { quietHours: { from: "bad", to: "07:00" } },
])("rejects a bad time %j and saves nothing", async (change) => {
  const { db, repo } = setup();
  const listener = vi.fn();
  repo.subscribe(listener);
  await expect(repo.set(change)).rejects.toThrow("invalid time");
  expect(await db.get("notification-settings", "me")).toBeNull();
  expect(listener).not.toHaveBeenCalled();
});

it("rejects a missing time as well", async () => {
  const { repo } = setup();
  const bad = { partnerHintTime: null } as unknown as {
    partnerHintTime: string;
  };
  await expect(repo.set(bad)).rejects.toThrow("invalid time");
});

it("reads and writes wellbeing in the cycle settings", async () => {
  const { db, repo } = setup();
  const cycleRepo = createCycleSettingsRepository(db);
  await cycleRepo.save(cycle);
  expect((await repo.get()).enabled.wellbeing).toBe(false);

  await repo.set({ enabled: { wellbeing: true } });
  expect((await cycleRepo.get())?.wellbeingReminder).toBe(true);
  expect((await repo.get()).enabled.wellbeing).toBe(true);

  await cycleRepo.save({ ...cycle, wellbeingReminder: false });
  expect((await repo.get()).enabled.wellbeing).toBe(false);
  const stored = await db.get("notification-settings", "me");
  expect(JSON.stringify(stored)).not.toContain('wellbeing":');
});

it("leaves wellbeing off when there are no cycle settings", async () => {
  const { db, repo } = setup();
  await repo.set({ enabled: { wellbeing: true } });
  expect((await repo.get()).enabled.wellbeing).toBe(false);
  expect(await db.get("cycle-settings", "me")).toBeNull();
});

it("is not synchronized: no handler and no envelope", () => {
  for (const file of ["wiring.ts", "handler-registry.ts"]) {
    const source = readFileSync(new URL(`../sync/${file}`, import.meta.url), {
      encoding: "utf8",
    });
    expect(source).not.toContain("notification-settings");
  }
});
