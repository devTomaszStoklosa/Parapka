import { ChoreValidationError, type IsoWeekday } from "./chore.js";
import type { IsoWeek } from "./mental-load.js";

export interface CheckinSchedule {
  weekday: IsoWeekday;
  hour: number;
  minute: number;
}

/** Sunday 19:00. */
export const DEFAULT_CHECKIN_SCHEDULE: CheckinSchedule = {
  weekday: 7,
  hour: 19,
  minute: 0,
};

/** Local calendar date and time as given by the caller; `month` is 1–12. */
export interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export interface CheckinWindow {
  week: IsoWeek;
  start: LocalDateTime;
  /** The opening of the next window. */
  end: LocalDateTime;
}

export const CHECKIN_SCALE_MIN = 1;
export const CHECKIN_SCALE_MAX = 5;
export const CHECKIN_NEED_MAX_LENGTH = 140;

export type CheckinScore = 1 | 2 | 3 | 4 | 5;

export interface CheckinAnswers {
  mood: CheckinScore;
  energy: CheckinScore;
  closeness: CheckinScore;
  need?: string;
}

/** The author's answers and whether the partner has filled in theirs. */
export interface CheckinState {
  answers: CheckinAnswers;
  partnerFilled: boolean;
}

export type CheckinWindowEndDecision =
  | { kind: "revealed" }
  | {
      kind: "incomplete";
      ownAnswers: "author-only";
      sealedPartnerAnswers: "delete";
    };

const DAY_MS = 24 * 60 * 60 * 1000;

function validateSchedule(schedule: CheckinSchedule): void {
  if (
    !Number.isInteger(schedule.weekday) ||
    schedule.weekday < 1 ||
    schedule.weekday > 7
  ) {
    throw new ChoreValidationError("check-in weekday must be 1–7");
  }
  if (
    !Number.isInteger(schedule.hour) ||
    schedule.hour < 0 ||
    schedule.hour > 23
  ) {
    throw new ChoreValidationError("check-in hour must be 0–23");
  }
  if (
    !Number.isInteger(schedule.minute) ||
    schedule.minute < 0 ||
    schedule.minute > 59
  ) {
    throw new ChoreValidationError("check-in minute must be 0–59");
  }
}

function toUtcMs(local: LocalDateTime): number {
  return Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
  );
}

function fromUtcMs(ms: number): LocalDateTime {
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

function isoWeekOf(ms: number): IsoWeek {
  const d = new Date(ms);
  const weekday = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  // The Thursday of the same ISO week decides the ISO year.
  const thursday = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + 4 - weekday,
  );
  const year = new Date(thursday).getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / DAY_MS / 7) + 1;
  return `${String(year)}-W${String(week).padStart(2, "0")}`;
}

/**
 * The window that is open at `local`: it opens at the latest occurrence of the
 * schedule not after `local` and lasts until the next one, 7 days later. The
 * week is the ISO week of the opening.
 */
export function currentCheckinWindow(
  local: LocalDateTime,
  schedule: CheckinSchedule = DEFAULT_CHECKIN_SCHEDULE,
): CheckinWindow {
  validateSchedule(schedule);
  const nowMs = toUtcMs(local);
  if (Number.isNaN(nowMs)) {
    throw new ChoreValidationError("invalid local date and time");
  }
  const now = new Date(nowMs);
  const nowWeekday = now.getUTCDay() === 0 ? 7 : now.getUTCDay();
  const daysBack = (nowWeekday - schedule.weekday + 7) % 7;
  let startMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysBack,
    schedule.hour,
    schedule.minute,
  );
  if (startMs > nowMs) startMs -= 7 * DAY_MS;
  return {
    week: isoWeekOf(startMs),
    start: fromUtcMs(startMs),
    end: fromUtcMs(startMs + 7 * DAY_MS),
  };
}

function isScore(value: unknown): value is CheckinScore {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= CHECKIN_SCALE_MIN &&
    value <= CHECKIN_SCALE_MAX
  );
}

export function createCheckinAnswers(input: {
  mood: number;
  energy: number;
  closeness: number;
  need?: string;
}): CheckinAnswers {
  if (!isScore(input.mood)) {
    throw new ChoreValidationError("mood must be an integer from 1 to 5");
  }
  if (!isScore(input.energy)) {
    throw new ChoreValidationError("energy must be an integer from 1 to 5");
  }
  if (!isScore(input.closeness)) {
    throw new ChoreValidationError("closeness must be an integer from 1 to 5");
  }
  if (input.need !== undefined) {
    if (typeof input.need !== "string") {
      throw new ChoreValidationError("need must be text");
    }
    if (input.need.length > CHECKIN_NEED_MAX_LENGTH) {
      throw new ChoreValidationError("need must be at most 140 characters");
    }
  }
  const answers: CheckinAnswers = {
    mood: input.mood,
    energy: input.energy,
    closeness: input.closeness,
  };
  if (input.need !== undefined) answers.need = input.need;
  return answers;
}

/** The author may change their answers until both have filled in. */
export function editCheckinAnswers(
  state: CheckinState,
  answers: CheckinAnswers,
): CheckinState {
  if (state.partnerFilled) {
    throw new ChoreValidationError("check-in answers can no longer be changed");
  }
  return { ...state, answers: createCheckinAnswers(answers) };
}

/**
 * What happens when the window ends. If both filled in, the answers are
 * revealed. Otherwise the result is the same whether or not the partner
 * filled in, so it does not disclose that.
 */
export function checkinWindowEndDecision(
  state: CheckinState,
): CheckinWindowEndDecision {
  if (state.partnerFilled) return { kind: "revealed" };
  return {
    kind: "incomplete",
    ownAnswers: "author-only",
    sealedPartnerAnswers: "delete",
  };
}
