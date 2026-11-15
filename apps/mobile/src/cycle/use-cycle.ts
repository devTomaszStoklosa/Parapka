import type {
  CalendarDate,
  CycleForecast,
  CyclePhaseEstimate,
  GrammaticalForm,
} from "@parapka/domain";
import type { PhaseDescription } from "@parapka/content";
import { useEffect, useMemo, useState } from "react";

import { createProfileRepository } from "../data/profile-repository";
import type { ProfileRepository } from "../data/profile-repository";
import type { Platform } from "../platform/context";
import { loadContent } from "./content";
import { isFeedbackDue } from "./hint-feedback-due";
import type { HintFeedbackRepository } from "./hint-feedback-repository";
import type { PeriodLog } from "./period-validation";
import type { CycleService } from "./cycle-service";
import type { WellbeingEntry } from "./wellbeing-validation";
import { wireCycle, wireHintFeedback } from "./wiring";

export interface CycleData {
  readonly today: CalendarDate;
  readonly periods: readonly PeriodLog[];
  readonly periodLength: number;
  /** Null without any saved start of a period. */
  readonly forecast: CycleForecast | null;
  /** The phase of today; null before the last saved start. */
  readonly phase: CyclePhaseEstimate | null;
  /** The library text of the phase; undefined when the library is invalid. */
  readonly description: PhaseDescription | undefined;
  readonly form: GrammaticalForm;
  /** The wellbeing entry of today; null before it is saved. */
  readonly wellbeing: WellbeingEntry | null;
  readonly wellbeingReminder: boolean;
  /** Whether the survey on the hints is due (FR-CYC-12). */
  readonly feedbackDue: boolean;
}

/** The data of the screen: null while loading, "failed" when it did not load. */
export type CycleState = CycleData | "failed" | null;

/** Reads everything the screen shows. */
async function loadCycle(
  service: CycleService,
  profiles: ProfileRepository,
  feedback: HintFeedbackRepository,
): Promise<CycleData> {
  const today = service.today();
  const [periods, cycle, forecast, phase, profile, wellbeing, survey] =
    await Promise.all([
      service.periods(),
      service.profile(),
      service.forecast(today),
      service.phaseOn(today, today),
      profiles.get(),
      service.wellbeingOn(today),
      feedback.state(),
    ]);
  return {
    today,
    periods,
    periodLength: cycle.typicalPeriodLength,
    forecast,
    phase,
    description: loadContent()?.phases.entries.find(
      (entry) => entry.phase === phase?.phase,
    ),
    form: profile?.form ?? "neutral",
    wellbeing,
    wellbeingReminder: cycle.wellbeingReminder,
    feedbackDue:
      profile?.cycle === "yes" && isFeedbackDue({ today, ...survey }),
  };
}

/**
 * Loads the cycle data and the description of today's phase, and loads them
 * again after every change of the cycle data, the wellbeing entries or the profile.
 */
export function useCycle(platform: Platform): CycleState {
  const service = useMemo(() => wireCycle(platform), [platform]);
  const profiles = useMemo(
    () => createProfileRepository(platform.database),
    [platform],
  );
  const feedback = useMemo(() => wireHintFeedback(platform), [platform]);
  const [state, setState] = useState<CycleState>(null);
  useEffect(() => {
    let active = true;
    let latest = 0;
    const load = () => {
      latest += 1;
      const issued = latest;
      const settle = (next: CycleState) => {
        if (active && issued === latest) setState(next);
      };
      loadCycle(service, profiles, feedback).then(settle, () => {
        settle("failed");
      });
    };
    load();
    const unsubscribe = [
      service.subscribe(load),
      service.subscribeWellbeing(load),
      profiles.subscribe(load),
      feedback.subscribe(load),
    ];
    return () => {
      active = false;
      for (const stop of unsubscribe) stop();
    };
  }, [service, profiles, feedback]);
  return state;
}
