import { wireChores } from "../chores/wiring";
import type { Platform } from "../platform/context";
import { createRecordHandler } from "../sync/record-handler";
import { ENTITY } from "./schedule-codec";
import {
  createScheduleRepository,
  type ScheduleRepository,
} from "./schedule-repository";

const wired = new WeakMap<Platform, { schedule: ScheduleRepository }>();

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

/** The repository of the check-in schedule: one per platform. */
export function wireCheckin(platform: Platform) {
  const known = wired.get(platform);
  if (known) return known;
  const { pairs } = wireChores(platform);
  const set = {
    schedule: createScheduleRepository({ database: platform.database, pairs }),
  };
  wired.set(platform, set);
  return set;
}
