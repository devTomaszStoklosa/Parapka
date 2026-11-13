import { wireChores } from "../chores/wiring";
import type { Platform } from "../platform/context";
import { createRecordHandler } from "../sync/record-handler";
import { createAnswersRepository } from "./answers-repository";
import { createCheckinService, type CheckinService } from "./checkin-service";
import { ENTITY } from "./schedule-codec";
import { SEALED_ENTITY } from "./sealed-codec";
import {
  createSealedRepository,
  type SealedRepository,
} from "./sealed-repository";
import {
  createScheduleRepository,
  type ScheduleRepository,
} from "./schedule-repository";

const wired = new WeakMap<
  Platform,
  {
    schedule: ScheduleRepository;
    sealed: SealedRepository;
    checkin: CheckinService;
  }
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

/**
 * Sync of the sealed versions of the check-ins (FR-CHK-03): the ciphertext
 * only, with the consent of CHECKIN. The pair that ends takes the received ones.
 */
export function createCheckinHandler(deps: {
  sealed: Pick<SealedRepository, "sync" | "subscribe" | "forgetReceived">;
}) {
  const { sync, subscribe, forgetReceived } = deps.sealed;
  return createRecordHandler({
    entity: SEALED_ENTITY,
    category: "CHECKIN",
    sync,
    subscribe,
    forget: forgetReceived,
  });
}

/** The check-in schedule and the check-in facade: one set per platform. */
export function wireCheckin(platform: Platform) {
  const known = wired.get(platform);
  if (known) return known;
  const { pairs, identity } = wireChores(platform);
  const schedule = createScheduleRepository({
    database: platform.database,
    pairs,
  });
  const sealed = createSealedRepository({
    database: platform.database,
    identity,
    sodium: platform.sodium,
  });
  const checkin = createCheckinService({
    clock: platform.clock,
    pairs,
    schedule,
    answers: createAnswersRepository(platform.database),
    sealed,
  });
  const set = { schedule, sealed, checkin };
  wired.set(platform, set);
  return set;
}
