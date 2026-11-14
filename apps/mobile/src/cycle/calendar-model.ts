import {
  fromDayNumber,
  toDayNumber,
  type CalendarDate,
  type CycleForecast,
} from "@parapka/domain";

import { periodDays, type PeriodLog } from "./period-validation";

/** One day of the month calendar (FR-CYC-03); no fertility or ovulation here. */
export interface CalendarDay {
  readonly date: CalendarDate;
  /** A saved day of the period. */
  readonly isPeriod: boolean;
  /** A day of the forecast range of the next period. */
  readonly inForecastRange: boolean;
  /** The estimated start of the next period. */
  readonly isNextStart: boolean;
  readonly isToday: boolean;
}

export interface CalendarInput {
  readonly year: number;
  /** 1–12. */
  readonly month: number;
  readonly periods: readonly PeriodLog[];
  /** Used for an ongoing entry, which counts as this many days. */
  readonly periodLength: number;
  readonly forecast: CycleForecast | null;
  readonly today: CalendarDate;
}

/** The days of a month with what the cycle data says about each of them. */
export function calendarMonth(input: CalendarInput): CalendarDay[] {
  const { year, month, forecast, today } = input;
  const first = toDayNumber(
    `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`,
  );
  const next =
    month === 12
      ? toDayNumber(`${String(year + 1).padStart(4, "0")}-01-01`)
      : toDayNumber(
          `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-01`,
        );
  const saved = new Set(periodDays(input.periods, input.periodLength));
  const rangeStart = forecast ? toDayNumber(forecast.rangeStart) : 0;
  const rangeEnd = forecast ? toDayNumber(forecast.rangeEnd) : -1;
  return Array.from({ length: next - first }, (_, i) => {
    const date = fromDayNumber(first + i);
    const day = first + i;
    return {
      date,
      isPeriod: saved.has(date),
      inForecastRange: day >= rangeStart && day <= rangeEnd,
      isNextStart: forecast?.nextStart === date,
      isToday: date === today,
    };
  });
}
