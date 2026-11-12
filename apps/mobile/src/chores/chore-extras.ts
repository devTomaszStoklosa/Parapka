import { ChoreValidationError } from "@parapka/domain";

export const NOTE_MAX_LENGTH = 500;

const REMINDER = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A note as stored: null (none) or a text that is not blank, up to 500 characters. */
export const isValidNote = (value: unknown): value is string | null =>
  value === null ||
  (typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= NOTE_MAX_LENGTH);

/** A reminder as stored: null (none) or a time `HH:MM`, 00:00 to 23:59. */
export const isValidReminder = (value: unknown): value is string | null =>
  value === null || (typeof value === "string" && REMINDER.test(value));

/** The typed time without the spaces around it; an empty text means none. */
export const normalizeReminder = (text: string): string | null =>
  text.trim() === "" ? null : text.trim();

/** Throws when the note or the reminder of a chore is not valid. */
export function validateExtras(chore: {
  readonly note?: unknown;
  readonly reminder?: unknown;
}) {
  if (!isValidNote(chore.note ?? null)) {
    throw new ChoreValidationError("invalid note");
  }
  if (!isValidReminder(chore.reminder ?? null)) {
    throw new ChoreValidationError("invalid reminder");
  }
}
