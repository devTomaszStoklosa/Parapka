import type { CheckinSchedule } from "@parapka/domain";
import { describe, expect, it } from "vitest";

import { clearPairLocally } from "../pairing/clear-pair";
import { sendRaw } from "../sync/sync-test-support";
import { exchange, setupSchedulePair } from "./checkin-test-support";

const SUNDAY: CheckinSchedule = { weekday: 7, hour: 19, minute: 0 };
const STAMP = "999999999999999-00000-device-a";

const content = (...changes: unknown[]) =>
  JSON.stringify({ schemaVersion: 1, changes });

const upsert = (fields: Record<string, unknown>) => ({
  entity: "CoupleSettings",
  id: "current",
  op: "upsert",
  fields: Object.fromEntries(
    Object.entries(fields).map(([name, value]) => [
      name,
      { value, hlc: STAMP },
    ]),
  ),
});

describe("schedule sync", () => {
  it("gives both phones Wednesday 19:00 after A changed the day", async () => {
    const pair = await setupSchedulePair();
    await pair.sa.set({ ...SUNDAY, weekday: 3 });
    await exchange(pair);
    const wednesday = { weekday: 3, hour: 19, minute: 0 };
    expect(await pair.sa.get()).toEqual(wednesday);
    expect(await pair.sb.get()).toEqual(wednesday);
  });

  it("keeps the day of A and the time of B changed offline", async () => {
    const pair = await setupSchedulePair();
    await pair.sa.set({ ...SUNDAY, weekday: 2 });
    await pair.sb.set({ ...SUNDAY, hour: 8, minute: 30 });
    await exchange(pair);
    await exchange(pair);
    const merged = { weekday: 2, hour: 8, minute: 30 };
    expect(await pair.sa.get()).toEqual(merged);
    expect(await pair.sb.get()).toEqual(merged);
  });

  it("lets the later of two offline changes of the day win on both", async () => {
    const pair = await setupSchedulePair();
    pair.a.restart({
      registry: pair.ua.registry,
      clock: { nowMs: () => 1_900_000_000_000 },
    });
    await pair.sa.set({ ...SUNDAY, weekday: 2 });
    await pair.sb.set({ ...SUNDAY, weekday: 5 });
    await exchange(pair);
    await exchange(pair);
    const later = { ...SUNDAY, weekday: 2 };
    expect(await pair.sa.get()).toEqual(later);
    expect(await pair.sb.get()).toEqual(later);
  });

  it("skips the invalid fields of the partner", async () => {
    const pair = await setupSchedulePair();
    await pair.sa.set({ ...SUNDAY, weekday: 4 });
    await exchange(pair);
    for (const [i, change] of [
      upsert({ checkInDay: 9 }),
      upsert({ checkInTime: "25:00", unknown: 1 }),
      { ...upsert({}), op: "delete", hlc: STAMP },
    ].entries()) {
      await sendRaw(pair, `bad-${String(i)}`, content(change));
    }
    await pair.b.engine.pull();
    expect(await pair.sb.get()).toEqual({ ...SUNDAY, weekday: 4 });
  });

  it("passes while paused and with every category off", async () => {
    const pair = await setupSchedulePair({
      isPaused: () => true,
      isShared: () => false,
    });
    await pair.sa.set({ ...SUNDAY, weekday: 6 });
    await exchange(pair);
    expect(await pair.sb.get()).toEqual({ ...SUNDAY, weekday: 6 });
  });

  it("starts the next pair from Sunday 19:00", async () => {
    const pair = await setupSchedulePair();
    await pair.sa.set({ ...SUNDAY, weekday: 3 });
    await exchange(pair);
    const registry = pair.ub.registry;
    await clearPairLocally({
      database: pair.b.database,
      registry,
      pairs: pair.b.pairs,
      consent: { clear: () => Promise.resolve() },
    });
    expect(await pair.sb.get()).toEqual(SUNDAY);
    expect(await pair.b.database.get("couple-settings", "current")).toBeNull();
  });
});
