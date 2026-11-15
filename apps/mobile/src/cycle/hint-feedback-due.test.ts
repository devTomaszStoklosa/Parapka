import { expect, it } from "vitest";

import { feedbackPeriod, isFeedbackDue } from "./hint-feedback-due";

const SINCE = "2026-10-28";

it("is not due without a first hint", () => {
  expect(
    isFeedbackDue({ today: "2026-11-11", since: null, lastShown: null }),
  ).toBe(false);
});

it("is due from the 14th day after the first hint, not before", () => {
  const due = (today: string) =>
    isFeedbackDue({ today, since: SINCE, lastShown: null });
  expect(due("2026-11-10")).toBe(false);
  expect(due("2026-11-11")).toBe(true);
  expect(due("2026-11-30")).toBe(true);
});

it("is due again 14 days after the last answer or closing", () => {
  const due = (today: string) =>
    isFeedbackDue({ today, since: SINCE, lastShown: "2026-11-11" });
  expect(due("2026-11-11")).toBe(false);
  expect(due("2026-11-17")).toBe(false);
  expect(due("2026-11-24")).toBe(false);
  expect(due("2026-11-25")).toBe(true);
});

it("asks about the 14 days that end on the day of the answer", () => {
  expect(feedbackPeriod("2026-11-14")).toBe("2026-11-01/2026-11-14");
  expect(feedbackPeriod("2026-03-05")).toBe("2026-02-20/2026-03-05");
});
