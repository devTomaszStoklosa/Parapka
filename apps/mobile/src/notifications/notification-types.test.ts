import { expect, it } from "vitest";

import {
  FORBIDDEN_NOTIFICATION_EVENTS,
  NOTIFICATION_TYPES,
} from "./notification-types";

const defaults = {
  "chore-reminder": true,
  checkin: true,
  "partner-hint": true,
  wellbeing: false,
  "handover-taken": true,
  "checkin-results": true,
  "pair-status": true,
};

it.each(Object.entries(defaults))("%s is on by default: %s", (id, on) => {
  const type = NOTIFICATION_TYPES.find((candidate) => candidate.id === id);
  expect(type?.defaultEnabled).toBe(on);
});

it("has exactly the types of FR-NOT-05, with unique ids", () => {
  const ids = NOTIFICATION_TYPES.map(({ id }) => id);
  expect([...ids].sort()).toEqual(Object.keys(defaults).sort());
  expect(new Set(ids).size).toBe(ids.length);
});

it("has no type for an event of FR-NOT-06", () => {
  expect(FORBIDDEN_NOTIFICATION_EVENTS.length).toBeGreaterThan(0);
  for (const event of FORBIDDEN_NOTIFICATION_EVENTS) {
    expect(NOTIFICATION_TYPES.map(({ id }) => id as string)).not.toContain(
      event,
    );
  }
});
