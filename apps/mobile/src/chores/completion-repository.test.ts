import { describe, expect, it, vi } from "vitest";

import { ME, WEEKDAYS, createSingleDevice } from "./chore-test-support";
import { createCompletionRepository } from "./completion-repository";

const input = { title: "Wynieść śmieci", rule: WEEKDAYS, assignment: ME };
const DAY = "2026-11-05";

function setup() {
  const deviceId = "device-solo";
  const solo = createSingleDevice(deviceId);
  const time = { now: 1_800_000_000_000 };
  const completions = createCompletionRepository({
    database: solo.database,
    chores: solo.chores,
    identity: { deviceId: () => Promise.resolve(deviceId) },
    clock: { nowMs: () => time.now },
  });
  return { ...solo, completions, time };
}

const change = (id: string, fields: Record<string, unknown>) => ({
  entity: "ChoreCompletion",
  id,
  op: "upsert" as const,
  fields: Object.fromEntries(
    Object.entries(fields).map(([name, value]) => [
      name,
      { value, hlc: "000000000000001-00000-device-b" },
    ]),
  ),
});

describe("completion repository", () => {
  it("ticks off an occurrence with the device and the time", async () => {
    const { chores, completions } = setup();
    const { id } = await chores.add(input);
    await completions.complete(id, DAY);
    expect(await completions.list()).toEqual([
      {
        choreId: id,
        occurrenceDate: DAY,
        completedBy: "device-solo",
        completedAt: "001800000000000-00000-device-solo",
      },
    ]);
  });

  it("takes back the own check-off and ticks off again", async () => {
    const { chores, completions } = setup();
    const { id } = await chores.add(input);
    await completions.complete(id, DAY);
    await completions.undo(id, DAY);
    expect(await completions.list()).toEqual([]);
    await completions.undo(id, DAY);
    await completions.complete(id, DAY);
    expect(await completions.list()).toHaveLength(1);
  });

  it("does nothing when there is nothing to take back", async () => {
    const { chores, completions } = setup();
    const { id } = await chores.add(input);
    await completions.undo(id, DAY);
    expect(await completions.list()).toEqual([]);
  });

  it("rejects an unknown chore and a bad date", async () => {
    const { chores, completions } = setup();
    await expect(completions.complete("nope", DAY)).rejects.toThrow(
      "unknown chore",
    );
    const { id } = await chores.add(input);
    await expect(completions.complete(id, "5.11")).rejects.toThrow(
      "invalid occurrence date",
    );
  });

  it("refuses to tick off while the device is not registered", async () => {
    const { database, chores } = setup();
    const { id } = await chores.add(input);
    const unknown = createCompletionRepository({
      database,
      chores,
      identity: { deviceId: () => Promise.resolve(null) },
      clock: { nowMs: () => 1 },
    });
    await expect(unknown.complete(id, DAY)).rejects.toThrow();
    await expect(unknown.undo(id, DAY)).rejects.toThrow();
  });

  it("tells the listeners about every change", async () => {
    const { chores, completions } = setup();
    const { id } = await chores.add(input);
    const listener = vi.fn();
    const stop = completions.subscribe(listener);
    await completions.complete(id, DAY);
    await completions.undo(id, DAY);
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    await completions.complete(id, DAY);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps the earlier check-off of the partner", async () => {
    const { chores, completions, time } = setup();
    const { id } = await chores.add(input);
    time.now = 1_800_000_000_100;
    await completions.complete(id, DAY);
    await completions.sync.merge(
      change(`${id}|${DAY}|device-b`, {
        choreId: id,
        occurrenceDate: DAY,
        completedBy: "device-b",
        completedAt: "001800000000050-00000-device-b",
      }),
    );
    expect(await completions.list()).toMatchObject([
      { completedBy: "device-b" },
    ]);
  });

  it("skips the invalid fields of the partner", async () => {
    const { completions } = setup();
    const id = "c|2026-11-05|device-b";
    await completions.sync.merge(change(id, { completedAt: "yesterday" }));
    await completions.sync.merge(change(id, { unknown: "x" }));
    await completions.sync.merge(
      change(id, { choreId: "c", occurrenceDate: "5.11", completedBy: "b" }),
    );
    await completions.sync.merge(
      change(id, {
        choreId: "c",
        occurrenceDate: DAY,
        completedBy: "device-b",
      }),
    );
    expect(await completions.list()).toEqual([]);
  });

  it("does not overwrite a private check-off with one of the partner", async () => {
    const { chores, completions, pairs } = setup();
    const { id } = await chores.add(input);
    expect(await pairs.activePair()).toBeNull();
    await completions.complete(id, DAY);
    const own = `${id}|${DAY}|device-solo`;
    await completions.sync.merge({
      entity: "ChoreCompletion",
      id: own,
      op: "delete",
      hlc: "000000000000001-00000-device-b",
    });
    expect(await completions.list()).toHaveLength(1);
  });
});
