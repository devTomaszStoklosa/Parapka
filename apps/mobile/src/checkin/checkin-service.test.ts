import { ChoreValidationError, type Clock } from "@parapka/domain";
import { expect, it, vi } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { createPairedDevices } from "../sync/sync-test-support";
import { createAnswersRepository } from "./answers-repository";
import { createCheckinService } from "./checkin-service";
import { createScheduleRepository } from "./schedule-repository";
import { createSealedRepository } from "./sealed-repository";

const input = { mood: 3, energy: 4, closeness: 5 };
const at = (local: string) => new Date(local).getTime();

async function setup(paired = true) {
  const { a, sodium } = await createPairedDevices();
  const database = paired ? a.database : createMemoryDatabase();
  const pairs = paired ? a.pairs : { activePair: () => Promise.resolve(null) };
  let now = at("2026-11-12T12:00");
  const clock: Clock = { nowMs: () => now };
  const schedule = createScheduleRepository({ database, pairs });
  const answers = createAnswersRepository(database);
  const sealed = createSealedRepository({
    database,
    identity: { deviceId: () => Promise.resolve(a.id) },
    sodium,
  });
  const service = createCheckinService({
    clock,
    pairs,
    schedule,
    answers,
    sealed,
  });
  return {
    service,
    database,
    schedule,
    at: (ms: number) => {
      now = ms;
    },
  };
}

it("shows the window of Thursday and an open status", async () => {
  const { service } = await setup();
  const view = await service.current();
  expect(view.window).toEqual({
    week: "2026-W45",
    start: { year: 2026, month: 11, day: 8, hour: 19, minute: 0 },
    end: { year: 2026, month: 11, day: 15, hour: 19, minute: 0 },
  });
  expect(view).toMatchObject({
    paired: true,
    own: null,
    status: "open",
    partner: null,
  });
});

it.each([
  [at("2026-11-15T18:59"), "2026-W45"],
  [at("2026-11-15T19:00"), "2026-W46"],
  [at("2026-12-27T19:00"), "2026-W52"],
  [at("2027-01-03T19:00"), "2026-W53"],
])("puts %i in week %s", async (ms, week) => {
  const { service, at: setNow } = await setup();
  setNow(ms);
  expect((await service.current()).window.week).toBe(week);
});

it("counts the window from the schedule of the pair", async () => {
  const { service, schedule } = await setup();
  await schedule.set({ weekday: 3, hour: 20, minute: 30 });
  expect((await service.current()).window.start).toEqual({
    year: 2026,
    month: 11,
    day: 11,
    hour: 20,
    minute: 30,
  });
});

it("needs a pair to submit", async () => {
  const { service } = await setup(false);
  expect((await service.current()).paired).toBe(false);
  await expect(service.submit(input)).rejects.toThrow(ChoreValidationError);
});

it("rejects invalid answers", async () => {
  const { service } = await setup();
  await expect(service.submit({ ...input, mood: 0 })).rejects.toThrow(
    ChoreValidationError,
  );
  await expect(
    service.submit({ ...input, need: "x".repeat(141) }),
  ).rejects.toThrow(ChoreValidationError);
  expect((await service.current()).status).toBe("open");
});

it("saves and edits the answers of the week, then opens a new week", async () => {
  const { service, at: setNow } = await setup();
  await service.submit(input);
  expect(await service.current()).toMatchObject({
    own: input,
    status: "filled",
  });
  await service.submit({ ...input, mood: 1, need: "rest" });
  expect((await service.current()).own).toEqual({
    ...input,
    mood: 1,
    need: "rest",
  });
  setNow(at("2026-11-15T19:00"));
  expect(await service.current()).toMatchObject({ own: null, status: "open" });
  expect(await service.hintCheckin()).toBeNull();
});

it("gives the hint input of the current week", async () => {
  const { service } = await setup();
  await service.submit(input);
  expect(await service.hintCheckin()).toEqual({
    date: "2026-11-08",
    answers: input,
  });
});

it("lists the history, the newest first and limited", async () => {
  const { service, at: setNow } = await setup();
  await service.submit(input);
  setNow(at("2026-11-15T19:00"));
  await service.submit({ ...input, mood: 2 });
  const [first, second] = await service.history(2);
  expect(first?.week).toBe("2026-W46");
  expect(second).toMatchObject({ week: "2026-W45", answers: input });
  expect(await service.history(1)).toHaveLength(1);
});

it("notifies about answers and schedule until unsubscribed", async () => {
  const { service, schedule } = await setup();
  const listener = vi.fn();
  const stop = service.subscribe(listener);
  await service.submit(input);
  await schedule.set({ weekday: 3, hour: 20, minute: 30 });
  expect(listener).toHaveBeenCalledTimes(2);
  stop();
  await service.submit(input);
  expect(listener).toHaveBeenCalledTimes(2);
});

it("seals every submit as a new version without the answers in the clear", async () => {
  const { service, database } = await setup();
  await service.submit({ ...input, need: "Spaceru we dwoje" });
  await service.submit(input);
  const rows = await database.list("checkin-sealed");
  expect(rows.map((row) => row.id)).toEqual([
    "2026-W45:device-a|1",
    "2026-W45:device-a|2",
  ]);
  const keys = rows.map((row) => (row.value as { sealKey: string }).sealKey);
  expect(new Set(keys).size).toBe(2);
  expect(JSON.stringify(rows)).not.toContain("Spaceru");
});
