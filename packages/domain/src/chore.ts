import {
  fromDayNumber,
  toDayNumber,
  type CalendarDate,
} from "./cycle-forecast.js";

export const CHORE_TITLE_MAX_LENGTH = 80;

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ChoreRule =
  | { kind: "daily" }
  | { kind: "everyNDays"; interval: number; startDate: CalendarDate }
  | { kind: "weekdays"; weekdays: readonly IsoWeekday[] }
  | { kind: "monthly"; dayOfMonth: number }
  /** Occasional chore; without a due date it has no computed occurrences. */
  | { kind: "occasional"; dueDate?: CalendarDate };

export interface Chore {
  id: string;
  title: string;
  rule: ChoreRule;
}

/** A completion refers to one occurrence, identified by this pair (FR-CHR-03). */
export interface ChoreOccurrence {
  choreId: string;
  occurrenceDate: CalendarDate;
}

export class ChoreValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChoreValidationError";
  }
}

export function validateChoreTitle(title: string): void {
  if (title.trim().length === 0) {
    throw new ChoreValidationError("chore title must not be empty");
  }
  if (Array.from(title).length > CHORE_TITLE_MAX_LENGTH) {
    throw new ChoreValidationError(
      `chore title must have at most ${String(CHORE_TITLE_MAX_LENGTH)} characters`,
    );
  }
}

function validateWeekdays(weekdays: readonly number[]): void {
  if (weekdays.length === 0) {
    throw new ChoreValidationError("at least one weekday is required");
  }
  for (const weekday of weekdays) {
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
      throw new ChoreValidationError(`invalid weekday ${String(weekday)}`);
    }
  }
}

function validateWholeNumber(value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ChoreValidationError(
      `${String(value)} is not an integer between ${String(min)} and ${String(max)}`,
    );
  }
}

export function validateChoreRule(rule: ChoreRule): void {
  switch (rule.kind) {
    case "daily":
      return;
    case "everyNDays":
      validateWholeNumber(rule.interval, 1, Number.MAX_SAFE_INTEGER);
      toDayNumber(rule.startDate);
      return;
    case "weekdays":
      validateWeekdays(rule.weekdays);
      return;
    case "monthly":
      validateWholeNumber(rule.dayOfMonth, 1, 31);
      return;
    case "occasional":
      if (rule.dueDate !== undefined) toDayNumber(rule.dueDate);
      return;
  }
}

export function validateChore(chore: Chore): void {
  validateChoreTitle(chore.title);
  validateChoreRule(chore.rule);
}

function isoWeekday(day: number): number {
  // Day 0 (1970-01-01) was a Thursday.
  return ((((day + 3) % 7) + 7) % 7) + 1;
}

/** Year and month (1-12) of a day number. */
function yearMonth(day: number): [number, number] {
  const date = new Date(day * 86_400_000);
  return [date.getUTCFullYear(), date.getUTCMonth() + 1];
}

/** Day number of the given day of a month, capped at the month's last day. */
function monthDay(year: number, month: number, dayOfMonth: number): number {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const date = new Date(Date.UTC(year, month - 1, Math.min(dayOfMonth, last)));
  return Math.round(date.getTime() / 86_400_000);
}

type DayRule<K extends ChoreRule["kind"]> = Extract<ChoreRule, { kind: K }>;

function everyDay(from: number, to: number): number[] {
  const days: number[] = [];
  for (let day = from; day <= to; day++) days.push(day);
  return days;
}

function everyNDays(rule: DayRule<"everyNDays">, from: number, to: number) {
  const start = toDayNumber(rule.startDate);
  const begin = Math.max(from, start);
  const offset =
    (((start - begin) % rule.interval) + rule.interval) % rule.interval;
  const days: number[] = [];
  for (let day = begin + offset; day <= to; day += rule.interval) {
    days.push(day);
  }
  return days;
}

function onWeekdays(rule: DayRule<"weekdays">, from: number, to: number) {
  const weekdays: readonly number[] = rule.weekdays;
  return everyDay(from, to).filter((day) => weekdays.includes(isoWeekday(day)));
}

function onMonthDay(rule: DayRule<"monthly">, from: number, to: number) {
  const [toYear, toMonth] = yearMonth(to);
  let [year, month] = yearMonth(from);
  const days: number[] = [];
  while (year < toYear || (year === toYear && month <= toMonth)) {
    const day = monthDay(year, month, rule.dayOfMonth);
    if (day >= from && day <= to) days.push(day);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return days;
}

function onDueDate(rule: DayRule<"occasional">, from: number, to: number) {
  if (rule.dueDate === undefined) return [];
  const due = toDayNumber(rule.dueDate);
  return due >= from && due <= to ? [due] : [];
}

function ruleDays(rule: ChoreRule, from: number, to: number): number[] {
  switch (rule.kind) {
    case "daily":
      return everyDay(from, to);
    case "everyNDays":
      return everyNDays(rule, from, to);
    case "weekdays":
      return onWeekdays(rule, from, to);
    case "monthly":
      return onMonthDay(rule, from, to);
    case "occasional":
      return onDueDate(rule, from, to);
  }
}

/** Occurrences of the chore from `from` to `to`, both inclusive, in date order. */
export function listOccurrences(
  chore: Chore,
  from: CalendarDate,
  to: CalendarDate,
): ChoreOccurrence[] {
  validateChore(chore);
  const fromDay = toDayNumber(from);
  const toDay = toDayNumber(to);
  if (fromDay > toDay) {
    throw new ChoreValidationError("range start is later than range end");
  }
  return ruleDays(chore.rule, fromDay, toDay).map((day) => ({
    choreId: chore.id,
    occurrenceDate: fromDayNumber(day),
  }));
}
