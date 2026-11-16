import { expect, it } from "vitest";

import type { NotificationSettings } from "./notification-settings";
import { NOTIFICATION_TYPES } from "./notification-types";
import { planNotifications, type PlannedNotification } from "./planned";
import { DEFAULT_QUIET_HOURS } from "./quiet-hours";

const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute).getTime();

const settings = (
  change: Partial<NotificationSettings> = {},
): NotificationSettings => ({
  enabled: Object.fromEntries(
    NOTIFICATION_TYPES.map((type) => [type.id, type.defaultEnabled]),
  ) as NotificationSettings["enabled"],
  discreet: true,
  quietHours: DEFAULT_QUIET_HOURS,
  partnerHintTime: "08:00",
  wellbeingTime: "20:00",
  ...change,
});

const item = (
  id: string,
  atMs: number,
  type: PlannedNotification["type"] = "chore-reminder",
): PlannedNotification => ({
  id,
  type,
  atMs,
  title: { key: "t", params: { title: "Śmieci" } },
  body: { key: "b" },
});

const window = { fromMs: at(16, 0), toMs: at(17, 23, 59) };

it("orders the notifications of all sources by time", () => {
  const plan = planNotifications({
    sources: [
      [item("b", at(16, 18))],
      [item("a", at(16, 9)), item("c", at(17, 8))],
    ],
    settings: settings(),
    ...window,
  });
  expect(plan.map((n) => n.id)).toEqual(["a", "b", "c"]);
});

it("skips the turned off types", () => {
  const off = settings().enabled;
  const plan = planNotifications({
    sources: [[item("a", at(16, 18)), item("b", at(16, 19), "checkin")]],
    settings: settings({ enabled: { ...off, "chore-reminder": false } }),
    ...window,
  });
  expect(plan.map((n) => n.id)).toEqual(["b"]);
});

it("moves a moment out of the quiet hours", () => {
  const plan = planNotifications({
    sources: [[item("a", at(16, 23))]],
    settings: settings(),
    ...window,
  });
  expect(plan.map((n) => n.atMs)).toEqual([at(17, 7)]);
});

it("filters by the window after the shift", () => {
  const plan = planNotifications({
    sources: [
      [
        item("early", at(15, 23)),
        item("late", at(17, 23)),
        item("out", at(18, 12)),
      ],
    ],
    settings: settings(),
    ...window,
  });
  expect(plan.map((n) => n.id)).toEqual(["early"]);
  expect(plan[0]?.atMs).toBe(at(16, 7));
});

it("keeps one notification per id", () => {
  const plan = planNotifications({
    sources: [[item("a", at(16, 18))], [item("a", at(16, 19))]],
    settings: settings(),
    ...window,
  });
  expect(plan).toHaveLength(1);
});

it("does not change the texts in the discreet mode", () => {
  const source = [item("a", at(16, 18))];
  const plan = planNotifications({
    sources: [source],
    settings: settings({ discreet: true }),
    ...window,
  });
  expect(plan[0]?.title).toEqual(source[0]?.title);
  expect(plan[0]?.body).toEqual(source[0]?.body);
});
