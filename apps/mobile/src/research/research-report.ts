import type { MentalLoadSnapshot, MentalLoadSplit } from "@parapka/domain";

import { localDate } from "../chores/planner-model";
import { isoWeek } from "../head/split-model";

const DAY_MS = 86_400_000;
const WEEK4_FIRST_DAY = 22;
const WEEK4_LAST_DAY = 28;
const WEEK6_OFFSET_DAYS = 35;

/** One saved answer of the survey on the hints: two ratings of 1–5. */
export interface FeedbackRating {
  accurate: number;
  notPushy: number;
}

export interface ReportInput {
  nowMs: number;
  /** When the pair was confirmed on this phone; null when unknown. */
  confirmedAtMs: number | null;
  /** The days with an opening of the app. */
  activeDays: readonly string[];
  /** How many weeks of the check-in were revealed. */
  revealedWeeks: number;
  /** The saved answers; null for a person without a cycle. */
  feedback: readonly FeedbackRating[] | null;
  /** Weekly snapshots of the mental load, oldest first. */
  trend: readonly MentalLoadSnapshot[];
}

/** The indicators of spec 10: numbers and null only, no content, no dates. */
export interface ResearchReport {
  reportVersion: 1;
  weeksSincePairing: number | null;
  activeDaysWeek4: number | null;
  checkinRevealRate: number | null;
  hintFeedback: {
    count: number;
    accurateAvg: number;
    notPushyAvg: number;
  } | null;
  mentalLoadWeek1: MentalLoadSplit | null;
  mentalLoadWeek6: MentalLoadSplit | null;
}

const round = (value: number, places: number) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/** Whole calendar days from one local date to another (DST-proof). */
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

const average = (values: readonly number[]) =>
  round(values.reduce((sum, value) => sum + value, 0) / values.length, 1);

function feedbackOf(
  ratings: readonly FeedbackRating[] | null,
): ResearchReport["hintFeedback"] {
  if (ratings === null || ratings.length === 0) return null;
  return {
    count: ratings.length,
    accurateAvg: average(ratings.map(({ accurate }) => accurate)),
    notPushyAvg: average(ratings.map(({ notPushy }) => notPushy)),
  };
}

function splitOf(
  trend: readonly MentalLoadSnapshot[],
  week: string,
): MentalLoadSplit | null {
  return trend.find((snapshot) => snapshot.week === week)?.split ?? null;
}

/** Counts the indicators of the research report; pure, only numbers come out. */
export function computeReport(input: ReportInput): ResearchReport {
  const { nowMs, confirmedAtMs, activeDays, revealedWeeks, trend } = input;
  const base = {
    reportVersion: 1 as const,
    hintFeedback: feedbackOf(input.feedback),
  };
  if (confirmedAtMs === null) {
    return {
      ...base,
      weeksSincePairing: null,
      activeDaysWeek4: null,
      checkinRevealRate: null,
      mentalLoadWeek1: null,
      mentalLoadWeek6: null,
    };
  }
  const paired = localDate(confirmedAtMs);
  const elapsed = daysBetween(paired, localDate(nowMs));
  const weeks = Math.floor(elapsed / 7);
  const sixth = new Date(confirmedAtMs);
  sixth.setDate(sixth.getDate() + WEEK6_OFFSET_DAYS);
  return {
    ...base,
    weeksSincePairing: weeks,
    activeDaysWeek4:
      elapsed < WEEK4_LAST_DAY
        ? null
        : activeDays.filter((day) => {
            const number = daysBetween(paired, day) + 1;
            return number >= WEEK4_FIRST_DAY && number <= WEEK4_LAST_DAY;
          }).length,
    checkinRevealRate:
      weeks === 0 ? null : round(Math.min(1, revealedWeeks / weeks), 2),
    mentalLoadWeek1: splitOf(trend, isoWeek(confirmedAtMs)),
    mentalLoadWeek6: splitOf(trend, isoWeek(sixth.getTime())),
  };
}
