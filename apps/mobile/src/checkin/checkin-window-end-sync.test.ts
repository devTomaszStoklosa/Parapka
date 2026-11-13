import type { Clock } from "@parapka/domain";
import { expect, it } from "vitest";

import { createPairedDevices, type Device } from "../sync/sync-test-support";
import { withCheckin } from "./checkin-test-support";
import type { KeyRecord } from "./key-codec";
import type { SealedRecord } from "./sealed-codec";

const WEEK = "2026-W45";
const answersA = { mood: 4, energy: 2, closeness: 5 };
const answersB = { mood: 1, energy: 3, closeness: 2 };
const at = (local: string) => new Date(local).getTime();

/** Two paired devices that share a clock, which the test moves. */
async function setup() {
  const devices = await createPairedDevices();
  let now = at("2026-11-12T12:00");
  const clock: Clock = { nowMs: () => now };
  const ua = withCheckin(devices.a, devices.sodium, clock);
  const ub = withCheckin(devices.b, devices.sodium, clock);
  return {
    ...devices,
    ua,
    ub,
    moveTo: (local: string) => {
      now = at(local);
    },
  };
}

const rows = async <T>(device: Device, name: string) =>
  (await device.database.list(name)).map((row) => row.value as T);

it("drops the version of A from B and sends no key when B did not fill in", async () => {
  const { a, b, ua, ub, moveTo } = await setup();
  await ua.service.submit(answersA);
  await a.engine.sync();
  await b.engine.sync();
  expect(await rows(b, "checkin-sealed")).toHaveLength(1);
  moveTo("2026-11-15T19:00");
  await b.engine.sync();
  await a.engine.sync();
  expect(await rows(b, "checkin-sealed")).toEqual([]);
  expect(await rows(a, "checkin-keys")).toEqual([]);
  expect(await rows(b, "checkin-keys")).toEqual([]);
  expect((await ua.service.history(5)).map((entry) => entry.week)).toEqual([
    WEEK,
  ]);
  expect(await ub.service.current()).toMatchObject({
    window: { week: "2026-W46" },
    status: "open",
    partner: null,
  });
});

it("starts a week as open for B whether or not A filled in", async () => {
  const { a, b, ua, ub, moveTo } = await setup();
  await ua.service.submit(answersA);
  await a.engine.sync();
  await b.engine.sync();
  moveTo("2026-11-15T19:00");
  const view = await ub.service.current();
  expect(view).toMatchObject({ status: "open", own: null, partner: null });
  expect(await rows(b, "checkin-sealed")).toEqual([]);
});

it("treats the answers of B after the end as those of the new week", async () => {
  const { a, b, ua, ub, moveTo } = await setup();
  await ua.service.submit(answersA);
  await a.engine.sync();
  await b.engine.sync();
  moveTo("2026-11-15T19:00");
  await ub.service.submit(answersB);
  await b.engine.sync();
  await a.engine.sync();
  await b.engine.sync();
  expect(await ub.service.current()).toMatchObject({
    window: { week: "2026-W46" },
    status: "filled",
  });
  expect(await ub.reveal.get(WEEK)).toBeNull();
  expect(await rows(b, "checkin-keys")).toEqual([]);
  expect(await rows(a, "checkin-keys")).toEqual([]);
});

it("reveals the week to both when the key of A comes after the end", async () => {
  const { a, b, ua, ub, moveTo } = await setup();
  await ua.service.submit(answersA);
  await a.engine.sync();
  await b.engine.sync();
  await ub.service.submit(answersB);
  await b.engine.sync();
  await a.engine.sync();
  await a.engine.sync();
  const own = await rows<KeyRecord>(a, "checkin-keys");
  expect(own.filter((key) => key.own).map((key) => key.sent)).toEqual([true]);
  moveTo("2026-11-15T19:00");
  await b.engine.sync();
  await a.engine.sync();
  expect(await ub.reveal.get(WEEK)).toEqual(answersA);
  expect(await ua.reveal.get(WEEK)).toEqual(answersB);
  expect(await rows(b, "checkin-sealed")).toHaveLength(2);
});

it("rejects a late version of A for a week that is over", async () => {
  const { a, b, ua, moveTo } = await setup();
  await ua.service.submit(answersA);
  await a.engine.sync();
  moveTo("2026-11-15T19:00");
  await b.engine.sync();
  const kept = await rows<SealedRecord>(b, "checkin-sealed");
  expect(kept).toEqual([]);
});

const HLC = "000000000000001-00000-device-b";

it("sends no new key of the week that is over from B after the end", async () => {
  const { a, b, ua, ub, moveTo } = await setup();
  await ua.service.submit(answersA);
  await a.engine.sync();
  await b.engine.sync();
  moveTo("2026-11-15T19:00");
  await ub.service.current();
  await ub.service.submit(answersB);
  expect(await ub.keys.sync.collect(() => HLC)).toEqual([]);
  expect(await ua.keys.sync.collect(() => HLC)).toEqual([]);
});

/** The window ends after A and B did or did not fill in. */
async function endWith(aFills: boolean, bFills: boolean) {
  const { a, b, ua, ub, moveTo } = await setup();
  if (aFills) await ua.service.submit(answersA);
  if (bFills) await ub.service.submit(answersB);
  await a.engine.sync();
  await b.engine.sync();
  moveTo("2026-11-15T19:00");
  await b.engine.sync();
  await a.engine.sync();
  return {
    a: {
      history: await ua.service.history(5),
      current: await ua.service.current(),
    },
    b: {
      history: await ub.service.history(5),
      current: await ub.service.current(),
    },
  };
}

it("shows the same state to who filled in whether or not the partner did", async () => {
  const partnerFilled = await endWith(true, true);
  const partnerNot = await endWith(true, false);
  expect(partnerFilled.a).toEqual(partnerNot.a);
});

it("shows the same state to who did not fill in whether or not the partner did", async () => {
  const partnerFilled = await endWith(true, false);
  const partnerNot = await endWith(false, false);
  expect(partnerFilled.b.current).toEqual(partnerNot.b.current);
  expect(partnerFilled.b.current).toMatchObject({
    status: "open",
    own: null,
    partner: null,
  });
});
