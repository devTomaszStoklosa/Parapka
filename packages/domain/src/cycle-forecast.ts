/** A calendar date in the `YYYY-MM-DD` format, without a time zone. */
export type CalendarDate = string;

export type CycleConfig =
  { unknown: true } | { cycleLength?: number; periodLength?: number };

export interface ResolvedCycleConfig {
  cycleLength: number;
  periodLength: number;
  confidence: "low" | "normal";
}

export interface CycleForecastInput {
  /** Start dates of the recorded periods, in any order. */
  periodStarts: readonly CalendarDate[];
  /** The current date, passed by the caller; the module never reads the clock. */
  today: CalendarDate;
  config?: CycleConfig;
}

export interface CycleForecast {
  nextStart: CalendarDate;
  rangeStart: CalendarDate;
  rangeEnd: CalendarDate;
  cycleLength: number;
  cycleLengthSource: "history" | "config";
  confidence: "low" | "normal";
  /** The result is always an estimate (FR-CYC-02). */
  isEstimate: true;
}

export class CycleConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CycleConfigError";
  }
}

export class CycleDateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CycleDateError";
  }
}

export const DEFAULT_CYCLE_LENGTH = 28;
export const DEFAULT_PERIOD_LENGTH = 5;
export const MIN_CYCLE_LENGTH = 21;
export const MAX_CYCLE_LENGTH = 45;
export const MIN_PERIOD_LENGTH = 2;
export const MAX_PERIOD_LENGTH = 10;
export const MAX_CYCLES_USED = 6;
export const MIN_CYCLES_FOR_HISTORY = 3;
export const MIN_MARGIN_DAYS = 2;

const MS_PER_DAY = 86_400_000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function checkRange(
  name: string,
  value: number,
  min: number,
  max: number,
): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new CycleConfigError(
      `${name} must be an integer between ${String(min)} and ${String(max)}`,
    );
  }
  return value;
}

export function resolveCycleConfig(
  config: CycleConfig = {},
): ResolvedCycleConfig {
  if ("unknown" in config) {
    return {
      cycleLength: DEFAULT_CYCLE_LENGTH,
      periodLength: DEFAULT_PERIOD_LENGTH,
      confidence: "low",
    };
  }
  const { cycleLength, periodLength } = config;
  return {
    cycleLength: checkRange(
      "cycleLength",
      cycleLength ?? DEFAULT_CYCLE_LENGTH,
      MIN_CYCLE_LENGTH,
      MAX_CYCLE_LENGTH,
    ),
    periodLength: checkRange(
      "periodLength",
      periodLength ?? DEFAULT_PERIOD_LENGTH,
      MIN_PERIOD_LENGTH,
      MAX_PERIOD_LENGTH,
    ),
    confidence: "normal",
  };
}

function toDayNumber(date: CalendarDate): number {
  const match = DATE_PATTERN.exec(date);
  if (!match) {
    throw new CycleDateError(`invalid date "${date}", expected YYYY-MM-DD`);
  }
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new CycleDateError(`invalid date "${date}"`);
  }
  return ms / MS_PER_DAY;
}

function fromDayNumber(day: number): CalendarDate {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function forecastCycle(input: CycleForecastInput): CycleForecast {
  const config = resolveCycleConfig(input.config);
  const today = toDayNumber(input.today);
  // A repeated date is one period recorded twice, not a zero-day cycle.
  const starts = [...new Set(input.periodStarts.map(toDayNumber))].sort(
    (a, b) => a - b,
  );

  if (starts.length === 0) {
    throw new CycleDateError("at least one period start is required");
  }
  const last = starts[starts.length - 1] as number;
  if (last > today) {
    throw new CycleDateError("period start is later than today");
  }

  const cycles = starts
    .slice(1)
    .map((start, i) => start - (starts[i] as number));
  const used = cycles.slice(-MAX_CYCLES_USED);
  const fromHistory = used.length >= MIN_CYCLES_FOR_HISTORY;

  let cycleLength = config.cycleLength;
  let deviation = 0;
  if (fromHistory) {
    const mean = used.reduce((sum, n) => sum + n, 0) / used.length;
    const variance =
      used.reduce((sum, n) => sum + (n - mean) ** 2, 0) / used.length;
    cycleLength = Math.round(mean);
    deviation = Math.sqrt(variance);
  }
  const margin = Math.max(MIN_MARGIN_DAYS, Math.round(deviation));
  const next = last + cycleLength;

  return {
    nextStart: fromDayNumber(next),
    rangeStart: fromDayNumber(next - margin),
    rangeEnd: fromDayNumber(next + margin),
    cycleLength,
    cycleLengthSource: fromHistory ? "history" : "config",
    confidence: fromHistory ? config.confidence : "low",
    isEstimate: true,
  };
}
