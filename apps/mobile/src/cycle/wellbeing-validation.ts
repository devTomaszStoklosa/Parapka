import { toDayNumber, type CalendarDate } from "@parapka/domain";

/** The known symptom tags (stable identifiers; labels come with the screen). */
export const WELLBEING_TAGS = [
  "headache",
  "cramps",
  "fatigue",
  "bloating",
  "sleep",
  "irritability",
] as const;

export type WellbeingTag = (typeof WELLBEING_TAGS)[number];

export const MAX_NOTE_LENGTH = 280;

/** A wellbeing entry (spec §3 `WellbeingEntry`); private, one per day. */
export interface WellbeingEntry {
  readonly date: CalendarDate;
  readonly energy: number;
  readonly mood: number;
  readonly tension: number;
  readonly desire?: number;
  readonly tags: readonly WellbeingTag[];
  readonly note?: string;
}

/** An invalid wellbeing entry; nothing is saved. */
export class WellbeingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WellbeingValidationError";
  }
}

function scale(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new WellbeingValidationError(
      `${name} must be an integer from 1 to 5`,
    );
  }
  return value;
}

function checkDate(date: CalendarDate): void {
  try {
    toDayNumber(date);
  } catch {
    throw new WellbeingValidationError(`invalid date "${date}"`);
  }
}

/** Throws on invalid data; returns the entry with the trimmed note. */
export function validateWellbeing(entry: WellbeingEntry): WellbeingEntry {
  checkDate(entry.date);
  const energy = scale("energy", entry.energy);
  const mood = scale("mood", entry.mood);
  const tension = scale("tension", entry.tension);
  const desire =
    entry.desire === undefined ? undefined : scale("desire", entry.desire);
  const known: readonly string[] = WELLBEING_TAGS;
  if (entry.tags.some((tag) => !known.includes(tag))) {
    throw new WellbeingValidationError("unknown tag");
  }
  if (new Set(entry.tags).size !== entry.tags.length) {
    throw new WellbeingValidationError("duplicated tag");
  }
  const note = (entry.note ?? "").trim();
  if (note.length > MAX_NOTE_LENGTH) {
    throw new WellbeingValidationError(
      `note is longer than ${String(MAX_NOTE_LENGTH)} characters`,
    );
  }
  return {
    date: entry.date,
    energy,
    mood,
    tension,
    ...(desire === undefined ? {} : { desire }),
    tags: [...entry.tags],
    ...(note === "" ? {} : { note }),
  };
}
