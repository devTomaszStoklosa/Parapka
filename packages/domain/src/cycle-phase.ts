import {
  type CalendarDate,
  type CycleConfig,
  CycleDateError,
  cycleLengthStats,
  forecastCycle,
  resolveCycleConfig,
  toDayNumber,
} from "./cycle-forecast.js";

export type CyclePhase =
  "menstruation" | "follicular" | "periovulatory" | "luteal" | "premenstrual";

/** The cycle is irregular when the standard deviation exceeds this many days. */
export const IRREGULAR_DEVIATION_DAYS = 7;
/** The middle of the periovulatory window: days before the next period. */
export const PERIOVULATORY_CENTER_DAYS = 14;
export const PERIOVULATORY_RADIUS_DAYS = 2;
export const PREMENSTRUAL_DAYS = 5;

export interface CyclePhaseInput {
  date: CalendarDate;
  /** Start dates of the recorded periods, in any order. */
  periodStarts: readonly CalendarDate[];
  /** The current date, passed by the caller; the module never reads the clock. */
  today: CalendarDate;
  config?: CycleConfig;
  /** Recorded period days; without them the forecast length is used. */
  periodDays?: readonly CalendarDate[];
}

export interface CyclePhaseEstimate {
  phase: CyclePhase;
  isIrregular: boolean;
  confidence: "low" | "normal";
  /** The result is always an estimate (FR-CYC-02). */
  isEstimate: true;
}

/** The phase of a day outside the period, by the days left to the next one. */
function phaseBeforeNextPeriod(left: number): CyclePhase {
  if (left <= PREMENSTRUAL_DAYS) return "premenstrual";
  if (Math.abs(left - PERIOVULATORY_CENTER_DAYS) <= PERIOVULATORY_RADIUS_DAYS) {
    return "periovulatory";
  }
  return left > PERIOVULATORY_CENTER_DAYS ? "follicular" : "luteal";
}

export function estimateCyclePhase(input: CyclePhaseInput): CyclePhaseEstimate {
  const config = resolveCycleConfig(input.config);
  const forecast = forecastCycle(input);
  const date = toDayNumber(input.date);
  const starts = [...new Set(input.periodStarts.map(toDayNumber))].sort(
    (a, b) => a - b,
  );
  const last = starts[starts.length - 1] as number;
  if (date < last) {
    throw new CycleDateError("date is earlier than the last period start");
  }

  const { cycleLength } = forecast;
  const offset = (date - last) % cycleLength;
  const inCurrentCycle = date - last < cycleLength;
  const recorded = new Set((input.periodDays ?? []).map(toDayNumber));
  const isPeriod =
    inCurrentCycle && recorded.size > 0
      ? recorded.has(date)
      : offset < config.periodLength;

  // Days left until the next period starts, from 1 to the cycle length.
  const left = cycleLength - offset;
  const phase = isPeriod ? "menstruation" : phaseBeforeNextPeriod(left);

  const { deviation } = cycleLengthStats(starts);
  const unknown = "unknown" in (input.config ?? {});
  return {
    phase,
    isIrregular: deviation > IRREGULAR_DEVIATION_DAYS,
    confidence: unknown || forecast.confidence === "low" ? "low" : "normal",
    isEstimate: true,
  };
}
