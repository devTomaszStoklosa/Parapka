import type { CheckinAnswers, IsoWeek } from "@parapka/domain";

import { changeChannel } from "../data/change-listeners";
import type { JsonValue, LocalDatabase } from "../data/local-database";

export const COLLECTION = "checkin-own";

/** The own answers of one week. */
export interface StoredAnswers {
  week: IsoWeek;
  answers: CheckinAnswers;
  submittedAt: number;
}

export interface AnswersRepository {
  get(week: IsoWeek): Promise<StoredAnswers | null>;
  put(entry: StoredAnswers): Promise<void>;
  /** All weeks, the newest first. */
  list(): Promise<StoredAnswers[]>;
  subscribe(listener: () => void): () => void;
}

/** Own check-in answers kept on the device only, one record per ISO week. */
export function createAnswersRepository(
  database: LocalDatabase,
): AnswersRepository {
  const changes = changeChannel(database, COLLECTION);
  return {
    subscribe: changes.subscribe,
    get: async (week) =>
      (await database.get(COLLECTION, week)) as unknown as StoredAnswers | null,
    put: async (entry) => {
      await database.put(COLLECTION, entry.week, entry as unknown as JsonValue);
      changes.notify();
    },
    list: async () =>
      (await database.list(COLLECTION))
        .map(({ value }) => value as unknown as StoredAnswers)
        .sort((a, b) => b.week.localeCompare(a.week)),
  };
}
