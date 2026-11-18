import type { LocalDatabase } from "../data/local-database";
import type { ProfileRepository } from "../data/profile-repository";
import { REVEALED_COLLECTION } from "../checkin/reveal";
import { HINT_FEEDBACK } from "../cycle/hint-feedback-repository";
import type { HeadService } from "../head/head-service";
import type { PairRepository } from "../pairing/pair-repository";
import type { ActivityLog } from "./activity-log";
import type { FeedbackRating, ReportInput } from "./research-report";

export interface ReportSources {
  database: LocalDatabase;
  pairs: Pick<PairRepository, "current">;
  activity: Pick<ActivityLog, "days">;
  profile: Pick<ProfileRepository, "get">;
  head: Pick<HeadService, "trend">;
  nowMs: number;
}

const isRating = (value: unknown): value is number => typeof value === "number";

/** The saved answers; the closings without an answer are left out. */
async function ratings(database: LocalDatabase): Promise<FeedbackRating[]> {
  const result: FeedbackRating[] = [];
  for (const { id, value } of await database.list(HINT_FEEDBACK)) {
    const { accurate, notPushy } = value as Record<string, unknown>;
    if (id.startsWith("entry-") && isRating(accurate) && isRating(notPushy)) {
      result.push({ accurate, notPushy });
    }
  }
  return result;
}

/** Reads the input of the report from the local data; nothing leaves the phone. */
export async function collectReportInput(
  sources: ReportSources,
): Promise<ReportInput> {
  const { database, pairs, activity, profile, head, nowMs } = sources;
  return {
    nowMs,
    confirmedAtMs: (await pairs.current())?.confirmedAtMs ?? null,
    activeDays: await activity.days(),
    revealedWeeks: (await database.list(REVEALED_COLLECTION)).length,
    feedback:
      (await profile.get())?.cycle === "yes" ? await ratings(database) : null,
    trend: await head.trend(),
  };
}
