import { expect, it } from "vitest";

import { shiftOutOfQuietHours } from "./quiet-hours";

const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute).getTime();

const night = { from: "22:00", to: "07:00" };
const afternoon = { from: "13:00", to: "15:00" };

it("moves 23:00 to 7:00 of the next day", () => {
  expect(shiftOutOfQuietHours(at(12, 23), night)).toBe(at(13, 7));
});

it("moves 22:00 and the end of the day to 7:00 of the next day", () => {
  expect(shiftOutOfQuietHours(at(12, 22), night)).toBe(at(13, 7));
  expect(shiftOutOfQuietHours(at(30, 23, 59), night)).toBe(
    new Date(2026, 11, 1, 7).getTime(),
  );
});

it("moves 6:59 to 7:00 of the same day", () => {
  expect(shiftOutOfQuietHours(at(12, 6, 59), night)).toBe(at(12, 7));
  expect(shiftOutOfQuietHours(at(12, 0), night)).toBe(at(12, 7));
});

it("keeps 7:00 and 21:59", () => {
  expect(shiftOutOfQuietHours(at(12, 7), night)).toBe(at(12, 7));
  expect(shiftOutOfQuietHours(at(12, 21, 59), night)).toBe(at(12, 21, 59));
});

it("handles quiet hours that do not cross midnight", () => {
  expect(shiftOutOfQuietHours(at(12, 14), afternoon)).toBe(at(12, 15));
  expect(shiftOutOfQuietHours(at(12, 13), afternoon)).toBe(at(12, 15));
  expect(shiftOutOfQuietHours(at(12, 15), afternoon)).toBe(at(12, 15));
  expect(shiftOutOfQuietHours(at(12, 12, 59), afternoon)).toBe(at(12, 12, 59));
});

it("does not shift when from equals to", () => {
  const none = { from: "22:00", to: "22:00" };
  expect(shiftOutOfQuietHours(at(12, 22, 30), none)).toBe(at(12, 22, 30));
});
