import { describe, expect, it } from "vitest";

import { createPairedDevices } from "../sync/sync-test-support";
import { ME, WEEKDAYS, withChores } from "./chore-test-support";

const input = { title: "Wynieść śmieci", rule: WEEKDAYS, assignment: ME };
const DAY = "2026-11-05";

async function setup(isShared?: () => boolean) {
  const devices = await createPairedDevices();
  const ua = withChores(devices.a, isShared);
  const ub = withChores(devices.b, isShared);
  return { ...devices, ua, ub };
}

async function exchange({ a, b }: Awaited<ReturnType<typeof setup>>) {
  await a.engine.sync();
  await b.engine.sync();
  await a.engine.sync();
}

/** A chore on both devices. */
async function shared(isShared?: () => boolean) {
  const pair = await setup(isShared);
  const { id } = await pair.ua.chores.add(input);
  await exchange(pair);
  return { pair, id };
}

describe("chore completion sync", () => {
  it("keeps the earlier of two check-offs made offline (FR-CHR-03)", async () => {
    const { pair, id } = await shared();
    pair.ub.time.now = 1_800_000_000_000;
    pair.ua.time.now = 1_800_000_005_000;
    await pair.ua.completions.complete(id, DAY);
    await pair.ub.completions.complete(id, DAY);
    await exchange(pair);
    await exchange(pair);
    for (const { completions } of [pair.ua, pair.ub]) {
      expect(await completions.list()).toMatchObject([
        { choreId: id, occurrenceDate: DAY, completedBy: "device-b" },
      ]);
    }
  });

  it("shows the partner a check-off and a take-back", async () => {
    const { pair, id } = await shared();
    await pair.ua.completions.complete(id, DAY);
    await exchange(pair);
    expect(await pair.ub.completions.list()).toMatchObject([
      { completedBy: "device-a" },
    ]);
    await pair.ub.completions.undo(id, DAY);
    expect(await pair.ub.completions.list()).toHaveLength(1);
    await pair.ua.completions.undo(id, DAY);
    await exchange(pair);
    expect(await pair.ub.completions.list()).toEqual([]);
    await pair.ua.completions.complete(id, DAY);
    await exchange(pair);
    expect(await pair.ub.completions.list()).toHaveLength(1);
  });

  it("does not send the check-off of a private chore", async () => {
    const { pair, id } = await shared();
    await pair.ua.handler.disconnected?.();
    await pair.ua.completionHandler.disconnected?.();
    await pair.ua.completions.complete(id, DAY);
    await exchange(pair);
    expect(await pair.ua.completions.list()).toHaveLength(1);
    expect(await pair.ub.completions.list()).toEqual([]);
  });

  it("keeps unsent check-offs on the device when the pair ends", async () => {
    const { pair, id } = await shared();
    await pair.ua.completions.complete(id, DAY);
    await pair.ua.completionHandler.disconnected?.();
    await pair.ua.completionHandler.disconnected?.();
    await exchange(pair);
    expect(await pair.ua.completions.list()).toHaveLength(1);
    expect(await pair.ub.completions.list()).toEqual([]);
  });

  it("sends nothing while SHARED_CHORES is off, and then everything", async () => {
    let on = true;
    const { pair, id } = await shared(() => on);
    on = false;
    await pair.ua.completions.complete(id, DAY);
    await exchange(pair);
    expect(await pair.ub.completions.list()).toEqual([]);
    on = true;
    await exchange(pair);
    expect(await pair.ub.completions.list()).toHaveLength(1);
  });
});
