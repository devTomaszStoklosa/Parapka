import {
  estimateCyclePhase,
  forecastCycle,
  type CalendarDate,
  type Clock,
  type CycleConfig,
  type CycleForecast,
  type CyclePhaseEstimate,
  type HintWellbeingEntry,
} from "@parapka/domain";

import { toLocalDateTime } from "../checkin/local-time";
import type { CycleProfile, CycleRepository } from "./cycle-repository";
import {
  periodDays,
  validatePeriod,
  type PeriodLog,
} from "./period-validation";
import type { WellbeingRepository } from "./wellbeing-repository";
import {
  validateWellbeing,
  WellbeingValidationError,
  type WellbeingEntry,
} from "./wellbeing-validation";

export interface CycleService {
  profile(): Promise<CycleProfile>;
  setWellbeingReminder(enabled: boolean): Promise<void>;
  periods(): Promise<PeriodLog[]>;
  /** Adds the entry, or replaces the one with the same `id`; throws when invalid. */
  savePeriod(period: PeriodLog): Promise<void>;
  deletePeriod(id: string): Promise<void>;
  /** The local date of today. */
  today(): CalendarDate;
  /** The forecast of the next period, or null without any saved start. */
  forecast(today: CalendarDate): Promise<CycleForecast | null>;
  /** The estimated phase of a day, or null before the last saved start. */
  phaseOn(
    date: CalendarDate,
    today: CalendarDate,
  ): Promise<CyclePhaseEstimate | null>;
  subscribe(listener: () => void): () => void;
  /** Adds the entry, or replaces the one of its day; throws when invalid. */
  saveWellbeing(entry: WellbeingEntry): Promise<void>;
  deleteWellbeing(date: CalendarDate): Promise<void>;
  wellbeingOn(date: CalendarDate): Promise<WellbeingEntry | null>;
  /** Only energy and mood of the days from `from` to `to`, for the engine. */
  wellbeingForHints(
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<HintWellbeingEntry[]>;
  /** Informs about every saved or deleted wellbeing entry. */
  subscribeWellbeing(listener: () => void): () => void;
}

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

const configOf = (profile: CycleProfile): CycleConfig =>
  profile.unknown
    ? { unknown: true }
    : {
        cycleLength: profile.typicalCycleLength,
        periodLength: profile.typicalPeriodLength,
      };

type WellbeingMethods = Pick<
  CycleService,
  | "saveWellbeing"
  | "deleteWellbeing"
  | "wellbeingOn"
  | "wellbeingForHints"
  | "subscribeWellbeing"
>;

function wellbeingMethods(
  wellbeing: WellbeingRepository,
  today: () => CalendarDate,
): WellbeingMethods {
  return {
    saveWellbeing: async (entry) => {
      const valid = validateWellbeing(entry);
      if (valid.date > today()) {
        throw new WellbeingValidationError("wellbeing date is in the future");
      }
      await wellbeing.put(valid);
    },
    deleteWellbeing: (date) => wellbeing.delete(date),
    wellbeingOn: (date) => wellbeing.get(date),
    subscribeWellbeing: (listener) => wellbeing.subscribe(listener),
    wellbeingForHints: async (from, to) =>
      (await wellbeing.range(from, to)).map(({ date, energy, mood }) => ({
        date,
        energy,
        mood,
      })),
  };
}

/** The cycle data of the phone: validation and estimates on top of the repository. */
export function createCycleService(deps: {
  clock: Clock;
  repository: CycleRepository;
  wellbeing: WellbeingRepository;
}): CycleService {
  const { clock, repository, wellbeing } = deps;
  const load = () => Promise.all([repository.profile(), repository.periods()]);
  const today = () => {
    const { year, month, day } = toLocalDateTime(clock.nowMs());
    return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
  };
  return {
    profile: () => repository.profile(),
    setWellbeingReminder: (enabled) => repository.setWellbeingReminder(enabled),
    periods: () => repository.periods(),
    subscribe: (listener) => repository.subscribe(listener),
    deletePeriod: (id) => repository.deletePeriod(id),
    today,
    ...wellbeingMethods(wellbeing, today),
    savePeriod: async (period) => {
      const [profile, periods] = await load();
      validatePeriod(period, periods, today(), profile.typicalPeriodLength);
      await repository.putPeriod(period);
    },
    forecast: async (day) => {
      const [profile, periods] = await load();
      if (periods.length === 0) return null;
      return forecastCycle({
        periodStarts: periods.map((p) => p.startDate),
        today: day,
        config: configOf(profile),
      });
    },
    phaseOn: async (date, day) => {
      const [profile, periods] = await load();
      const last = periods[periods.length - 1];
      if (!last || date < last.startDate) return null;
      return estimateCyclePhase({
        date,
        periodStarts: periods.map((p) => p.startDate),
        today: day,
        config: configOf(profile),
        periodDays: periodDays(periods, profile.typicalPeriodLength),
      });
    },
  };
}
