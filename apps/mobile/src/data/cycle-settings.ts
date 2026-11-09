import {
  DEFAULT_CYCLE_LENGTH,
  DEFAULT_PERIOD_LENGTH,
  MAX_CYCLE_LENGTH,
  MAX_PERIOD_LENGTH,
  MIN_CYCLE_LENGTH,
  MIN_PERIOD_LENGTH,
  toDayNumber,
} from "@parapka/domain";

import type { JsonValue, LocalDatabase } from "./local-database";

const COLLECTION = "cycle-settings";
const ID = "me";

/** Cycle settings from onboarding (FR-CYC-01). */
export interface CycleSettings {
  /** The user does not know the values: the defaults stay, confidence is low. */
  readonly unknown: boolean;
  /** Start of the last period as YYYY-MM-DD, null when it is not known. */
  readonly lastPeriodStart: string | null;
  readonly cycleLength: number;
  readonly periodLength: number;
}

/** Settings of a user who does not know the values ("nie wiem"). */
export const UNKNOWN_CYCLE_SETTINGS: CycleSettings = {
  unknown: true,
  lastPeriodStart: null,
  cycleLength: DEFAULT_CYCLE_LENGTH,
  periodLength: DEFAULT_PERIOD_LENGTH,
};

function inRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

function isDate(value: string): boolean {
  try {
    toDayNumber(value);
    return true;
  } catch {
    return false;
  }
}

/** Valid settings, or null when a value is out of range or not a date. */
export function parseCycleSettings(input: {
  lastPeriodStart: string;
  cycleLength: number;
  periodLength: number;
}): CycleSettings | null {
  const { lastPeriodStart, cycleLength, periodLength } = input;
  if (
    !isDate(lastPeriodStart) ||
    !inRange(cycleLength, MIN_CYCLE_LENGTH, MAX_CYCLE_LENGTH) ||
    !inRange(periodLength, MIN_PERIOD_LENGTH, MAX_PERIOD_LENGTH)
  ) {
    return null;
  }
  return { unknown: false, lastPeriodStart, cycleLength, periodLength };
}

export interface CycleSettingsRepository {
  /** The saved settings, or null when the user has no cycle settings. */
  get(): Promise<CycleSettings | null>;
  save(settings: CycleSettings): Promise<void>;
}

export function createCycleSettingsRepository(
  db: LocalDatabase,
): CycleSettingsRepository {
  return {
    get: async () => {
      const value = await db.get(COLLECTION, ID);
      return value === null ? null : (value as unknown as CycleSettings);
    },
    save: (settings) =>
      db.put(COLLECTION, ID, settings as unknown as JsonValue),
  };
}
