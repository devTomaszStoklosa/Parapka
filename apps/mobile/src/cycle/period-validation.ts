import {
  fromDayNumber,
  MAX_PERIOD_LENGTH,
  toDayNumber,
  type CalendarDate,
} from "@parapka/domain";

/** A period entry (spec §3 `PeriodLog`); `endDate` is null while it lasts. */
export interface PeriodLog {
  readonly id: string;
  readonly startDate: CalendarDate;
  readonly endDate: CalendarDate | null;
}

/** An invalid period entry; nothing is saved. */
export class PeriodValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PeriodValidationError";
  }
}

function dayOf(date: CalendarDate): number {
  try {
    return toDayNumber(date);
  } catch {
    throw new PeriodValidationError(`invalid date "${date}"`);
  }
}

/** The last day an entry occupies; an ongoing one only its first day. */
const lastDay = (period: PeriodLog) =>
  dayOf(period.endDate ?? period.startDate);

/**
 * Throws when the entry starts after `today`, ends before it starts or more
 * than `MAX_PERIOD_LENGTH` days after, or overlaps one of the `others`.
 */
export function validatePeriod(
  period: PeriodLog,
  others: readonly PeriodLog[],
  today: CalendarDate,
): void {
  const start = dayOf(period.startDate);
  const end = lastDay(period);
  if (start > dayOf(today)) {
    throw new PeriodValidationError("period starts later than today");
  }
  if (end < start) {
    throw new PeriodValidationError("period ends before it starts");
  }
  if (end - start > MAX_PERIOD_LENGTH) {
    throw new PeriodValidationError(
      `period lasts more than ${String(MAX_PERIOD_LENGTH)} days`,
    );
  }
  const overlaps = others.some(
    (other) =>
      other.id !== period.id &&
      start <= lastDay(other) &&
      dayOf(other.startDate) <= end,
  );
  if (overlaps) {
    throw new PeriodValidationError("period overlaps another one");
  }
}

/**
 * The days of the entries: from the start to the end, an ongoing entry counts
 * as `periodLength` days.
 */
export function periodDays(
  periods: readonly PeriodLog[],
  periodLength: number,
): CalendarDate[] {
  return periods.flatMap((period) => {
    const start = toDayNumber(period.startDate);
    const end =
      period.endDate === null
        ? start + periodLength - 1
        : toDayNumber(period.endDate);
    return Array.from({ length: end - start + 1 }, (_, i) =>
      fromDayNumber(start + i),
    );
  });
}
