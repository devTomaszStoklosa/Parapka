import {
  findPhrases,
  parseForbiddenLists,
} from "../../../../packages/content/src/forbidden";
import { expect, it } from "vitest";

import forbidden from "../../../../content/forbidden-phrases.json";
import { pl } from "../i18n/pl";
import { planHintReminders } from "./hint-reminders";
import type { NotificationSettings } from "./notification-settings";
import { NOTIFICATION_TYPES } from "./notification-types";
import { planNotifications } from "./planned";
import { DEFAULT_QUIET_HOURS } from "./quiet-hours";

const at = (hour: number, minute = 0) =>
  new Date(2026, 10, 16, hour, minute).getTime();

const hint = { forDate: "2026-11-16", status: "scheduled" } as const;

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

it("plans the hint of today at 08:00 and at the changed time", () => {
  expect(
    planHintReminders({ hint, time: "08:00" }).map(({ id, atMs }) => ({
      id,
      atMs,
    })),
  ).toEqual([{ id: "partner-hint:2026-11-16", atMs: at(8) }]);
  expect(planHintReminders({ hint, time: "09:30" })[0]?.atMs).toBe(at(9, 30));
});

it("plans nothing for a skipped hint or for no hint", () => {
  expect(
    planHintReminders({ hint: { ...hint, status: "skipped" }, time: "08:00" }),
  ).toEqual([]);
  expect(planHintReminders({ hint: null, time: "08:00" })).toEqual([]);
});

it("does not give away the cycle in the texts (FR-CYC-09)", () => {
  const { revealing } = parseForbiddenLists(forbidden);
  const texts = Object.values(pl.notifications.partnerHint);
  expect(texts).toHaveLength(2);
  const found = texts.flatMap((text) => findPhrases(text, [...revealing]));
  expect(found).toEqual([]);
});

it("honours the quiet hours and the switch of the type", () => {
  const sources = [planHintReminders({ hint, time: "08:00" })];
  const range = { fromMs: at(0), toMs: at(23, 59) };
  const quiet = { from: "07:00", to: "09:00" };
  expect(
    planNotifications({ sources, settings: settings({}, quiet), ...range }).map(
      ({ atMs }) => atMs,
    ),
  ).toEqual([at(9)]);
  expect(
    planNotifications({
      sources,
      settings: settings({ "partner-hint": false }),
      ...range,
    }),
  ).toEqual([]);
});
