import { expect, it } from "vitest";

import { NOTIFICATION_TYPES } from "./notification-types";
import type { NotificationSettings } from "./notification-settings";
import { planNotifications } from "./planned";
import { DEFAULT_QUIET_HOURS } from "./quiet-hours";
import { planWellbeingReminders } from "./wellbeing-reminders";

const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute).getTime();

const window = { fromMs: at(16, 0), toMs: at(17, 23, 59) };
const base = { enabled: true, time: "20:00", entryDates: [], ...window };

const settings = (
  wellbeing: boolean,
  quietHours = DEFAULT_QUIET_HOURS,
): NotificationSettings => ({
  enabled: {
    ...(Object.fromEntries(
      NOTIFICATION_TYPES.map((type) => [type.id, type.defaultEnabled]),
    ) as NotificationSettings["enabled"]),
    wellbeing,
  },
  discreet: true,
  quietHours,
  partnerHintTime: "08:00",
  wellbeingTime: "20:00",
});

const ats = (items: { atMs: number }[]) => items.map(({ atMs }) => atMs);

it("plans a reminder every day at the time of the settings", () => {
  const items = planWellbeingReminders(base);
  expect(items.map(({ id }) => id)).toEqual([
    "wellbeing:2026-11-15",
    "wellbeing:2026-11-16",
    "wellbeing:2026-11-17",
  ]);
  expect(ats(items)).toEqual([at(15, 20), at(16, 20), at(17, 20)]);
  expect(items[0]).toMatchObject({
    type: "wellbeing",
    title: { key: "notifications.wellbeing.title" },
    body: { key: "notifications.wellbeing.body" },
  });
});

it("plans the reminders at the new time", () => {
  expect(ats(planWellbeingReminders({ ...base, time: "18:30" }))).toEqual([
    at(15, 18, 30),
    at(16, 18, 30),
    at(17, 18, 30),
  ]);
});

it("plans nothing when it is turned off", () => {
  expect(planWellbeingReminders({ ...base, enabled: false })).toEqual([]);
});

it("skips the day with an entry", () => {
  const items = planWellbeingReminders({
    ...base,
    entryDates: ["2026-11-16"],
  });
  expect(items.map(({ id }) => id)).toEqual([
    "wellbeing:2026-11-15",
    "wellbeing:2026-11-17",
  ]);
});

it("is moved out of the quiet hours by planNotifications", () => {
  const sources = [planWellbeingReminders({ ...base, time: "23:00" })];
  const planned = planNotifications({
    sources,
    settings: settings(true),
    ...window,
  });
  expect(ats(planned)).toEqual([at(16, 7), at(17, 7)]);
});

it("is dropped by planNotifications when the type is turned off", () => {
  const sources = [planWellbeingReminders(base)];
  expect(
    planNotifications({ sources, settings: settings(false), ...window }),
  ).toEqual([]);
});
