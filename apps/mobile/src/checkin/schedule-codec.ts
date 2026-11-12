import {
  ChoreValidationError,
  DEFAULT_CHECKIN_SCHEDULE,
  type CheckinSchedule,
} from "@parapka/domain";

export const COLLECTION = "couple-settings";
export const RECORD_ID = "current";
export const ENTITY = "CoupleSettings";

export type ScheduleField = "checkInDay" | "checkInTime";

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

const isScheduleField = (name: string): name is ScheduleField =>
  name === "checkInDay" || name === "checkInTime";

const CHECKS: Record<ScheduleField, (value: unknown) => boolean> = {
  checkInDay: (value) =>
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 7,
  checkInTime: (value) => typeof value === "string" && TIME.test(value),
};

export const isValidScheduleField = (name: string, value: unknown) =>
  isScheduleField(name) && CHECKS[name](value);

const pad = (value: number) => String(value).padStart(2, "0");

/** The record fields of a schedule; throws when a value is invalid. */
export function toFields(schedule: CheckinSchedule) {
  const fields = {
    checkInDay: schedule.weekday,
    checkInTime: `${pad(schedule.hour)}:${pad(schedule.minute)}`,
  };
  if (!CHECKS.checkInDay(fields.checkInDay)) {
    throw new ChoreValidationError("check-in weekday must be 1–7");
  }
  if (!CHECKS.checkInTime(fields.checkInTime)) {
    throw new ChoreValidationError("check-in time must be 00:00–23:59");
  }
  return fields;
}

export const DEFAULT_FIELDS = toFields(DEFAULT_CHECKIN_SCHEDULE);

/** The schedule of the record fields; a missing field is the default. */
export function toSchedule(values: Record<string, unknown>): CheckinSchedule {
  const merged: Record<string, unknown> = { ...DEFAULT_FIELDS, ...values };
  const { checkInDay, checkInTime } = merged;
  const [hour, minute] = String(checkInTime).split(":").map(Number);
  return {
    weekday: checkInDay as CheckinSchedule["weekday"],
    hour: hour as number,
    minute: minute as number,
  };
}
