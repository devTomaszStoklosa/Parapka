import { currentCheckinWindow } from "@parapka/domain";
import { expect, it } from "vitest";

import { t } from "../i18n";
import { pl } from "../i18n/pl";
import { planCheckinReminders } from "./checkin-reminders";
import { planNotifications } from "./planned";
import type { NotificationSettings } from "./notification-settings";
import { DEFAULT_QUIET_HOURS } from "./quiet-hours";
import { NOTIFICATION_TYPES } from "./notification-types";

const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute).getTime();

// Sunday 15 November 2026, 19:00 opens the window of the default schedule.
const window = currentCheckinWindow({
  year: 2026,
  month: 11,
  day: 16,
  hour: 9,
  minute: 0,
});

const settings = (
  enabled: Partial<NotificationSettings["enabled"]> = {},
  quietHours = DEFAULT_QUIET_HOURS,
): NotificationSettings => ({
  enabled: {
    ...(Object.fromEntries(
      NOTIFICATION_TYPES.map((type) => [type.id, type.defaultEnabled]),
    ) as NotificationSettings["enabled"]),
    ...enabled,
  },
  discreet: true,
  quietHours,
  partnerHintTime: "08:00",
  wellbeingTime: "20:00",
});

const open = { window, paired: true, shared: true, status: "open" } as const;

it("plans one reminder at the opening and one 24 hours later", () => {
  const planned = planCheckinReminders(open);
  expect(planned.map(({ id, atMs }) => ({ id, atMs }))).toEqual([
    { id: "checkin:2026-W46:first", atMs: at(15, 19) },
    { id: "checkin:2026-W46:repeat", atMs: at(16, 19) },
  ]);
});

it("plans nothing once the own check-in is filled in", () => {
  for (const status of ["filled", "locked", "revealed"] as const) {
    expect(planCheckinReminders({ ...open, status })).toEqual([]);
  }
});

it("plans nothing without a pair", () => {
  expect(planCheckinReminders({ ...open, paired: false })).toEqual([]);
});

it("is the same whether or not the partner filled in (FR-CHK-07)", () => {
  // A filled in own check-in ends the reminders, locked by the partner or not.
  expect(planCheckinReminders({ ...open, status: "locked" })).toEqual(
    planCheckinReminders({ ...open, status: "filled" }),
  );
});

it("plans nothing while the check-in is turned off", () => {
  expect(planCheckinReminders({ ...open, shared: false })).toEqual([]);
});

it("does not name the partner in any text of the reminder", () => {
  const texts = Object.values(pl.notifications.checkin);
  expect(texts).toHaveLength(2);
  const planned = planCheckinReminders(open);
  const ids = planned.flatMap(({ title, body }) => [title, body]);
  for (const { key } of ids) {
    expect(key).not.toMatch(/partner/i);
    expect(t(key as Parameters<typeof t>[0])).not.toMatch(/partner/i);
  }
});

it("honours the quiet hours and the switch of the type", () => {
  const sources = [planCheckinReminders(open)];
  const range = { fromMs: at(15, 0), toMs: at(17, 23, 59) };
  expect(
    planNotifications({ sources, settings: settings(), ...range }),
  ).toHaveLength(2);
  const quiet = { from: "18:00", to: "20:00" };
  expect(
    planNotifications({
      sources,
      settings: settings({}, quiet),
      ...range,
    }).map(({ atMs }) => atMs),
  ).toEqual([at(15, 20), at(16, 20)]);
  expect(
    planNotifications({
      sources,
      settings: settings({ checkin: false }),
      ...range,
    }),
  ).toEqual([]);
});
