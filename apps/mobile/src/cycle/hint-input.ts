import type { ContentLibrary } from "@parapka/content";
import {
  HINT_DAYS_AHEAD,
  HINT_ENTRY_DAYS,
  HINT_HISTORY_DAYS,
  type CalendarDate,
  type GrammaticalForm,
  type HintCheckin,
  type HintDay,
  type HintEngineInput,
} from "@parapka/domain";

import type { CheckinService } from "../checkin/checkin-service";
import type { CycleService } from "./cycle-service";
import { addDays, type HintRepository } from "./hint-repository";

export interface HintInputDeps {
  cycle: Pick<CycleService, "phaseOn" | "wellbeingForHints">;
  checkin: Pick<CheckinService, "hintCheckin">;
  hints: Pick<HintRepository, "forDate" | "range">;
}

/** The days to generate: today when it has no hint yet, and the next ones. */
async function daysToGenerate(
  deps: HintInputDeps,
  today: CalendarDate,
): Promise<HintDay[]> {
  const result: HintDay[] = [];
  for (let offset = 0; offset < HINT_DAYS_AHEAD; offset += 1) {
    const date = addDays(today, offset);
    // A hint of today that is saved does not change any more.
    if (offset === 0 && (await deps.hints.forDate(date)) !== null) continue;
    const estimate = await deps.cycle.phaseOn(date, today);
    if (estimate !== null) result.push({ date, estimate });
  }
  return result;
}

/**
 * What the engine gets, or null when no day can be estimated. The past hints
 * are those of the 14 days before the first recomputed day.
 */
export async function buildHintInput(
  deps: HintInputDeps,
  context: {
    today: CalendarDate;
    form: GrammaticalForm;
    library: ContentLibrary;
  },
): Promise<HintEngineInput | null> {
  const { today, form, library } = context;
  const days = await daysToGenerate(deps, today);
  const first = days[0];
  if (first === undefined) return null;
  const past = await deps.hints.range(
    addDays(first.date, -HINT_HISTORY_DAYS),
    addDays(first.date, -1),
  );
  const checkin: HintCheckin | null = await deps.checkin.hintCheckin();
  return {
    today,
    days,
    entries: await deps.cycle.wellbeingForHints(
      addDays(today, 1 - HINT_ENTRY_DAYS),
      today,
    ),
    ...(checkin === null ? {} : { checkin }),
    pastHints: past.map(({ forDate, templateId }) => ({
      date: forDate,
      templateId,
    })),
    form,
    rules: library.engineRules.entries,
    templates: library.hintTemplates.entries,
    contentVersion: library.hintTemplates.contentVersion,
  };
}
