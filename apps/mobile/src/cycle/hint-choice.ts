import {
  generateHints,
  type CalendarDate,
  type GeneratedHint,
  type HintEngineInput,
} from "@parapka/domain";

import type { HintGeneratorDeps } from "./hint-generator";
import { buildHintInput } from "./hint-input";
import type { StoredHint } from "./hint-repository";

export const CANDIDATE_COUNT = 3;

export interface HintChoice {
  /**
   * Up to 3 different hints for today, the current one first; empty for any
   * other day or without a hint of today.
   */
  candidates(today: CalendarDate): Promise<GeneratedHint[]>;
  /** Replaces the hint of today with a candidate; false if it is none. */
  choose(today: CalendarDate, templateId: string): Promise<boolean>;
  /** The partner sees no hint for today; false for any other day. */
  skip(today: CalendarDate): Promise<boolean>;
  /** Brings back a skipped hint of today; false for any other day. */
  restore(today: CalendarDate): Promise<boolean>;
}

const asGenerated = (hint: StoredHint): GeneratedHint => ({
  templateId: hint.templateId,
  contentVersion: hint.contentVersion,
  category: hint.category,
  date: hint.forDate,
  text: hint.text,
});

/**
 * Asks the engine again for the same day, each time with the templates found
 * so far as used today, so every answer is another template.
 */
function addCandidates(input: HintEngineInput, found: GeneratedHint[]) {
  const [day] = input.days;
  while (day !== undefined && found.length < CANDIDATE_COUNT) {
    const used = found.map(({ templateId }) => ({
      date: day.date,
      templateId,
    }));
    const [next] = generateHints({
      ...input,
      days: [day],
      pastHints: [...input.pastHints, ...used],
    });
    if (!next) break;
    found.push(next);
  }
  return found;
}

export function createHintChoice(deps: HintGeneratorDeps): HintChoice {
  const { cycle, hints } = deps;
  const isToday = (day: CalendarDate) => day === cycle.today();
  const candidates = async (day: CalendarDate) => {
    const current = await hints.forDate(day);
    const profile = await deps.profiles.get();
    const library = deps.library();
    if (!isToday(day) || current === null || !profile || !library) return [];
    // The record of today is not read, so the engine computes the day anew.
    const input = await buildHintInput(
      {
        ...deps,
        hints: {
          forDate: () => Promise.resolve(null),
          range: (from, to) => hints.range(from, to),
        },
      },
      { today: day, form: profile.form, library },
    );
    const found = [asGenerated(current)];
    return input?.days[0]?.date === day ? addCandidates(input, found) : found;
  };
  return {
    candidates,
    choose: async (day, templateId) => {
      const chosen = (await candidates(day)).find(
        (candidate) => candidate.templateId === templateId,
      );
      if (!chosen) return false;
      await hints.replace(chosen);
      return true;
    },
    skip: async (day) =>
      isToday(day) && (await hints.setStatus(day, "skipped")),
    restore: async (day) =>
      isToday(day) && (await hints.setStatus(day, "scheduled")),
  };
}
