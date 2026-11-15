import type { CalendarDate } from "@parapka/domain";

import { changeChannel } from "../data/change-listeners";
import type { JsonValue, LocalDatabase } from "../data/local-database";
import { feedbackPeriod } from "./hint-feedback-due";
import type { HintRepository } from "./hint-repository";

/** The collection of the survey: local only, with no sync handler (FR-CYC-12). */
export const HINT_FEEDBACK = "hint-feedback";

const SINCE = "since";
const ENTRY = "entry-";

export interface HintFeedbackState {
  /** The day of the first own hint; it outlives the pruning of the hints. */
  since: CalendarDate | null;
  /** The day of the last answer or closing. */
  lastShown: CalendarDate | null;
}

export interface HintFeedbackRepository {
  state(): Promise<HintFeedbackState>;
  /** Remembers the day of the first hint, unless an earlier one is known. */
  noteFirstHint(date: CalendarDate): Promise<void>;
  /** Saves the answer: the 14 days that end on `today`, two ratings of 1–5. */
  save(today: CalendarDate, accurate: number, notPushy: number): Promise<void>;
  /** Closes the card without an answer; it counts as shown. */
  close(today: CalendarDate): Promise<void>;
  subscribe(listener: () => void): () => void;
}

const dateOf = (value: unknown): CalendarDate | null => {
  const date = (value as { date?: unknown } | null)?.date;
  return typeof date === "string" ? date : null;
};

/** The answers of the survey on the hints. They never leave the phone. */
export function createHintFeedbackRepository(
  database: LocalDatabase,
): HintFeedbackRepository {
  const changes = changeChannel(database, HINT_FEEDBACK);
  const put = async (id: string, value: JsonValue) => {
    await database.put(HINT_FEEDBACK, id, value);
    changes.notify();
  };
  return {
    subscribe: changes.subscribe,
    state: async () => {
      const dates = (await database.list(HINT_FEEDBACK))
        .filter(({ id }) => id.startsWith(ENTRY))
        .map(({ value }) => dateOf(value))
        .filter((date) => date !== null)
        .sort();
      return {
        since: dateOf(await database.get(HINT_FEEDBACK, SINCE)),
        lastShown: dates.at(-1) ?? null,
      };
    },
    noteFirstHint: async (date) => {
      const known = dateOf(await database.get(HINT_FEEDBACK, SINCE));
      if (known === null || date < known) await put(SINCE, { date });
    },
    save: (today, accurate, notPushy) =>
      put(`${ENTRY}${today}`, {
        date: today,
        period: feedbackPeriod(today),
        accurate,
        notPushy,
      }),
    close: (today) => put(`${ENTRY}${today}`, { date: today, closed: true }),
  };
}

const FIRST = "0000-01-01";
const LAST = "9999-12-31";

/**
 * Remembers the day of the first own hint, now and after every change of the
 * hints. Returns the function that stops it.
 */
export function followFirstHint(
  hints: Pick<HintRepository, "range" | "subscribe">,
  feedback: Pick<HintFeedbackRepository, "noteFirstHint">,
): () => void {
  const note = () => {
    hints
      .range(FIRST, LAST)
      .then(([first]) => (first ? feedback.noteFirstHint(first.forDate) : null))
      .catch(() => undefined);
  };
  note();
  return hints.subscribe(note);
}
