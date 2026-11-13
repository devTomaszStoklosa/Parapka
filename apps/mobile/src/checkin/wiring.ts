import { wireChores } from "../chores/wiring";
import type { Platform } from "../platform/context";
import { createRecordHandler } from "../sync/record-handler";
import { createAnswersRepository } from "./answers-repository";
import { createCheckinService, type CheckinService } from "./checkin-service";
import { ENTITY } from "./schedule-codec";
import {
  createScheduleRepository,
  type ScheduleRepository,
} from "./schedule-repository";

const wired = new WeakMap<
  Platform,
  { schedule: ScheduleRepository; checkin: CheckinService }
>();

/**
 * Sync of the check-in schedule of the pair: data of the pair, so it needs no
 * consent and the pause does not hold it. The pair that ends takes the record.
 */
export function createScheduleHandler(deps: {
  schedule: Pick<ScheduleRepository, "sync" | "subscribe" | "forget">;
}) {
  const { sync, subscribe, forget } = deps.schedule;
  return createRecordHandler({
    entity: ENTITY,
    category: null,
    sync,
    subscribe,
    forget,
  });
}

/** The check-in schedule and the check-in facade: one set per platform. */
export function wireCheckin(platform: Platform) {
  const known = wired.get(platform);
  if (known) return known;
  const { pairs } = wireChores(platform);
  const schedule = createScheduleRepository({
    database: platform.database,
    pairs,
  });
  const checkin = createCheckinService({
    clock: platform.clock,
    pairs,
    schedule,
    answers: createAnswersRepository(platform.database),
  });
  const set = { schedule, checkin };
  wired.set(platform, set);
  return set;
}
