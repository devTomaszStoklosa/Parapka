import { changeChannel } from "../data/change-listeners";
import {
  createCycleSettingsRepository,
  UNKNOWN_CYCLE_SETTINGS,
  type CycleSettings,
  type CycleSettingsRepository,
} from "../data/cycle-settings";
import type { JsonValue, LocalDatabase } from "../data/local-database";
import type { PeriodLog } from "./period-validation";

export const PERIODS = "period-logs";
const SEED_ID = "seed";

/** The cycle profile (spec §3 `CycleProfile`); it stays on the phone. */
export interface CycleProfile {
  readonly typicalCycleLength: number;
  readonly typicalPeriodLength: number;
  readonly unknown: boolean;
  readonly wellbeingReminder: boolean;
}

export interface CycleRepository {
  /** The profile; the defaults before the settings of the onboarding exist. */
  profile(): Promise<CycleProfile>;
  setWellbeingReminder(enabled: boolean): Promise<void>;
  /** The entries, the oldest first; the first read adds the one from onboarding. */
  periods(): Promise<PeriodLog[]>;
  putPeriod(period: PeriodLog): Promise<void>;
  deletePeriod(id: string): Promise<void>;
  subscribe(listener: () => void): () => void;
}

const storedPeriods = async (database: LocalDatabase) =>
  (await database.list(PERIODS))
    .map(({ value }) => value as unknown as PeriodLog)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

/** Makes the first entry from the last period of the onboarding, once. */
async function seedFirstPeriod(
  database: LocalDatabase,
  settings: CycleSettingsRepository,
) {
  const current = await settings.get();
  if (current?.lastPeriodStart == null || current.seeded === true) return;
  const entry: PeriodLog = {
    id: SEED_ID,
    startDate: current.lastPeriodStart,
    endDate: null,
  };
  if ((await storedPeriods(database)).length === 0) {
    await database.put(PERIODS, SEED_ID, entry as unknown as JsonValue);
  }
  await settings.save({ ...current, seeded: true });
}

/** The cycle data kept in the local database only, never synchronized. */
export function createCycleRepository(
  database: LocalDatabase,
): CycleRepository {
  const settings = createCycleSettingsRepository(database);
  const changes = changeChannel(database, "cycle");
  const stored = () => storedPeriods(database);
  const seed = () => seedFirstPeriod(database, settings);

  const change = async (update: (current: CycleSettings) => CycleSettings) => {
    const current = (await settings.get()) ?? UNKNOWN_CYCLE_SETTINGS;
    await settings.save(update(current));
    changes.notify();
  };

  return {
    subscribe: changes.subscribe,
    profile: async () => {
      const current = (await settings.get()) ?? UNKNOWN_CYCLE_SETTINGS;
      return {
        typicalCycleLength: current.cycleLength,
        typicalPeriodLength: current.periodLength,
        unknown: current.unknown,
        wellbeingReminder: current.wellbeingReminder ?? false,
      };
    },
    setWellbeingReminder: (enabled) =>
      change((current) => ({ ...current, wellbeingReminder: enabled })),
    periods: async () => {
      await seed();
      return stored();
    },
    putPeriod: async (period) => {
      await seed();
      await database.put(PERIODS, period.id, period as unknown as JsonValue);
      changes.notify();
    },
    deletePeriod: async (id) => {
      await seed();
      await database.delete(PERIODS, id);
      changes.notify();
    },
  };
}
