import { expect, it } from "vitest";

import { toLocalDateTime } from "./local-time";

it("reads the local date and time, with the month from 1", () => {
  const ms = new Date(2026, 10, 12, 12, 5).getTime();
  expect(toLocalDateTime(ms)).toEqual({
    year: 2026,
    month: 11,
    day: 12,
    hour: 12,
    minute: 5,
  });
});
