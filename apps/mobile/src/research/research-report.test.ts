import { expect, it } from "vitest";

import { isoWeek } from "../head/split-model";
import { computeReport, type ReportInput } from "./research-report";

const at = (month: number, day: number) =>
  new Date(2026, month - 1, day, 12).getTime();
const key = (month: number, day: number) =>
  `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const input = (patch: Partial<ReportInput>): ReportInput => ({
  nowMs: at(11, 14),
  confirmedAtMs: at(10, 15),
  activeDays: [],
  revealedWeeks: 0,
  feedback: null,
  trend: [],
  ...patch,
});

it("counts the days of week 4 for a pair of 30 days", () => {
  // 15 October is day 1, so day 22 is 5 November and day 28 is 11 November.
  const activeDays = [
    key(11, 4),
    key(11, 5),
    key(11, 6),
    key(11, 7),
    key(11, 8),
    key(11, 11),
    key(11, 12),
    key(10, 20),
  ];
  const report = computeReport(input({ activeDays }));
  expect(report.activeDaysWeek4).toBe(5);
  expect(report.weeksSincePairing).toBe(4);
});

it("has no week 4 for a pair of 10 days or of 27 days", () => {
  const week4 = (confirmedAtMs: number) =>
    computeReport(input({ confirmedAtMs })).activeDaysWeek4;
  expect(week4(at(11, 4))).toBeNull();
  expect(week4(at(10, 18))).toBeNull();
  expect(week4(at(10, 17))).toBe(0);
});

it("divides the revealed weeks by the weeks since the pairing", () => {
  const rate = (revealedWeeks: number, confirmedAtMs: number | null) =>
    computeReport(input({ revealedWeeks, confirmedAtMs })).checkinRevealRate;
  expect(rate(3, at(10, 17))).toBe(0.75);
  expect(rate(1, at(10, 1))).toBe(0.17);
  expect(rate(9, at(10, 17))).toBe(1);
  expect(rate(3, null)).toBeNull();
  expect(rate(0, at(11, 10))).toBeNull();
});

it("returns only nulls without the pairing date", () => {
  const report = computeReport(input({ confirmedAtMs: null, feedback: [] }));
  expect(report).toEqual({
    reportVersion: 1,
    weeksSincePairing: null,
    activeDaysWeek4: null,
    checkinRevealRate: null,
    hintFeedback: null,
    mentalLoadWeek1: null,
    mentalLoadWeek6: null,
  });
});

it("averages the survey to one place and is null without answers", () => {
  const feedback = [
    { accurate: 4, notPushy: 5 },
    { accurate: 3, notPushy: 4 },
    { accurate: 3, notPushy: 4 },
  ];
  expect(computeReport(input({ feedback })).hintFeedback).toEqual({
    count: 3,
    accurateAvg: 3.3,
    notPushyAvg: 4.3,
  });
  expect(computeReport(input({ feedback: [] })).hintFeedback).toBeNull();
  expect(computeReport(input({ feedback: null })).hintFeedback).toBeNull();
});

it("takes the split of week 1 and week 6 from the snapshots", () => {
  const week6 = isoWeek(at(11, 19));
  const trend = [
    { week: isoWeek(at(10, 15)), split: { me: 70, partner: 30 } },
    { week: week6, split: { me: 55, partner: 45 } },
  ];
  const report = computeReport(input({ trend }));
  expect(report.mentalLoadWeek1).toEqual({ me: 70, partner: 30 });
  expect(report.mentalLoadWeek6).toEqual({ me: 55, partner: 45 });
  const empty = computeReport(input({ trend: [{ week: week6, split: null }] }));
  expect(empty.mentalLoadWeek1).toBeNull();
  expect(empty.mentalLoadWeek6).toBeNull();
});
