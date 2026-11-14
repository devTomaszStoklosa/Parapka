import {
  estimateCyclePhase,
  forecastCycle,
  type CalendarDate,
  type Clock,
  type CycleConfig,
  type CycleForecast,
  type CyclePhaseEstimate,
} from "@parapka/domain";

import { toLocalDateTime } from "../checkin/local-time";
import type { CycleProfile, CycleRepository } from "./cycle-repository";
import {
  periodDays,
  validatePeriod,
  type PeriodLog,
} from "./period-validation";

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
}

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

const configOf = (profile: CycleProfile): CycleConfig =>
  profile.unknown
    ? { unknown: true }
    : {
        cycleLength: profile.typicalCycleLength,
        periodLength: profile.typicalPeriodLength,
      };

/** The cycle data of the phone: validation and estimates on top of the repository. */
export function createCycleService(deps: {
  clock: Clock;
  repository: CycleRepository;
}): CycleService {
  const { clock, repository } = deps;
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
