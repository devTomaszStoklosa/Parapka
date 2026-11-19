import { createUuid7Generator } from "@parapka/domain";
import { expect, it } from "vitest";

import {
  createSingleDevice,
  ME,
  PARTNER,
  setupChorePair,
} from "../chores/chore-test-support";
import { createCompletionRepository } from "../chores/completion-repository";
import { planChoreReminders } from "./chore-reminders";
import { NOTIFICATION_TYPES } from "./notification-types";
import type { NotificationSettings } from "./notification-settings";
import { planNotifications } from "./planned";
import { DEFAULT_QUIET_HOURS } from "./quiet-hours";

const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute).getTime();

const window = { fromMs: at(16, 0), toMs: at(17, 23, 59) };
const DAILY = { kind: "daily" } as const;

const settings = (
  enabled: Partial<NotificationSettings["enabled"]> = {},
): NotificationSettings => ({
  enabled: {
    ...(Object.fromEntries(
      NOTIFICATION_TYPES.map((type) => [type.id, type.defaultEnabled]),
    ) as NotificationSettings["enabled"]),
    ...enabled,
  },
  discreet: true,
  quietHours: DEFAULT_QUIET_HOURS,
  partnerHintTime: "08:00",
  wellbeingTime: "20:00",
});

/** A device without a pair and the plan made from its local data only. */
function setup() {
  const device = createSingleDevice();
  const completions = createCompletionRepository({
    database: device.database,
    chores: device.chores,
    identity: { deviceId: () => Promise.resolve("device-solo") },
    clock: { nowMs: () => at(16, 12) },
  });
  const plan = async (enabled?: Partial<NotificationSettings["enabled"]>) =>
    planNotifications({
      sources: [
        planChoreReminders({
          chores: await device.chores.list(),
          completions: await completions.list(),
          ...window,
        }),
      ],
      settings: settings(enabled),
      ...window,
    });
  return { chores: device.chores, completions, plan };
}

const input = (
  assignment: typeof ME | typeof PARTNER | object,
  reminder: string | null = "18:00",
) =>
  ({ title: "Śmieci", rule: DAILY, assignment, reminder }) as Parameters<
    ReturnType<typeof setup>["chores"]["add"]
  >[0];

it("plans one reminder per day of the window for my chore", async () => {
  const { chores, plan } = setup();
  const chore = await chores.add(input(ME));
  const result = await plan();
  expect(result.map((n) => n.atMs)).toEqual([at(16, 18), at(17, 18)]);
  expect(result[0]).toMatchObject({
    id: `chore-reminder:${chore.id}:2026-11-16`,
    type: "chore-reminder",
    title: {
      key: "notifications.choreReminder.title",
      params: { title: "Śmieci" },
    },
    body: { key: "notifications.choreReminder.body" },
  });
});

it("keeps the id stable between calls", async () => {
  const { chores, plan } = setup();
  await chores.add(input(ME));
  expect((await plan()).map((n) => n.id)).toEqual(
    (await plan()).map((n) => n.id),
  );
});

it("plans nothing for a chore without a reminder", async () => {
  const { chores, plan } = setup();
  await chores.add(input(ME, null));
  expect(await plan()).toEqual([]);
});

it("plans nothing for the chore of the partner", async () => {
  const { ca } = await setupChorePair();
  await ca.add(input(PARTNER));
  expect(
    planChoreReminders({
      chores: await ca.list(),
      completions: [],
      ...window,
    }),
  ).toEqual([]);
});

it("plans reminders for a chore of both and of anyone", async () => {
  const { chores, plan } = setup();
  await chores.add(input({ kind: "both" }));
  await chores.add(input({ kind: "anyone" }));
  expect(await plan()).toHaveLength(4);
});

it("plans only my days of an alternating chore, even before its start", async () => {
  const { chores, plan } = setup();
  await chores.add(
    input({ kind: "alternating", firstPerson: "me", startDate: "2026-11-17" }),
  );
  expect((await plan()).map((n) => n.atMs)).toEqual([at(17, 18)]);
});

it("skips the checked off occurrence", async () => {
  const { chores, completions, plan } = setup();
  const chore = await chores.add(input(ME));
  await completions.complete(chore.id, "2026-11-16");
  expect((await plan()).map((n) => n.atMs)).toEqual([at(17, 18)]);
});

it("moves a reminder of 23:00 to 7:00 of the next day", async () => {
  const { chores, plan } = setup();
  await chores.add(input(ME, "23:00"));
  expect((await plan()).map((n) => n.atMs)).toEqual([at(16, 7), at(17, 7)]);
});

it("plans nothing when the type is turned off", async () => {
  const { chores, plan } = setup();
  await chores.add(input(ME));
  expect(await plan({ "chore-reminder": false })).toEqual([]);
});

it("works for a private chore on a device without a pair", async () => {
  const { chores, plan } = setup();
  const chore = await chores.add(input(ME));
  expect(chore.shared).toBe(false);
  expect(await plan()).toHaveLength(2);
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** A chore saved now, with an id made at `createdMs`, planned as the runner does at `nowMs`. */
async function planCreatedAt(
  createdMs: number,
  nowMs: number,
  reminder = "18:00",
  id?: string,
) {
  const { chores } = setup();
  const stored = await chores.add(input(ME, reminder));
  const newId = createUuid7Generator({
    clock: { nowMs: () => createdMs },
    random: { bytes: (length) => new Uint8Array(length) },
  });
  const chore = { ...stored, id: id ?? newId() };
  const window = { fromMs: nowMs - DAY_MS, toMs: nowMs };
  const plan = planNotifications({
    sources: [
      planChoreReminders({ chores: [chore], completions: [], ...window }),
    ],
    settings: settings(),
    ...window,
  });
  return { chore, plan };
}

it("plans nothing for a day before the chore was created", async () => {
  const early = await planCreatedAt(at(16, 17, 55), at(16, 17, 56));
  expect(early.plan).toEqual([]);
  const later = await planCreatedAt(at(16, 17, 55), at(16, 18, 1));
  expect(later.plan.map((n) => [n.id, n.atMs])).toEqual([
    [`chore-reminder:${later.chore.id}:2026-11-16`, at(16, 18)],
  ]);
});

it("drops the moved reminder of the day before the chore was created", async () => {
  const { chore, plan } = await planCreatedAt(
    at(16, 22, 30),
    at(17, 7, 1),
    "23:00",
  );
  expect(plan.map((n) => [n.id, n.atMs])).toEqual([
    [`chore-reminder:${chore.id}:2026-11-16`, at(17, 7)],
  ]);
});

it("keeps the overdue reminder of a chore created earlier", async () => {
  const { chore, plan } = await planCreatedAt(at(14, 12), at(16, 17, 56));
  expect(plan.map((n) => n.id)).toContain(
    `chore-reminder:${chore.id}:2026-11-15`,
  );
});

it("does not filter a chore whose id is not a UUIDv7", async () => {
  const { plan } = await planCreatedAt(0, at(16, 17, 56), "18:00", "c-1");
  expect(plan.map((n) => n.id)).toContain("chore-reminder:c-1:2026-11-15");
});

it("compares the moments, not the days, with the creation", async () => {
  const created = at(16, 18, 0) + 30_000;
  const same = await planCreatedAt(created, at(16, 18, 1));
  expect(same.plan).toEqual([]);
  const next = await planCreatedAt(created, at(17, 18, 1));
  expect(next.plan.map((n) => n.id)).toEqual([
    `chore-reminder:${next.chore.id}:2026-11-17`,
  ]);
});
