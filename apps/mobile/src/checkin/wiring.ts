import { wireChores } from "../chores/wiring";
import type { Platform } from "../platform/context";
import type { RecordHandlerSync } from "../sync/record-handler";
import { createRecordHandler } from "../sync/record-handler";
import { createAnswersRepository } from "./answers-repository";
import { createCheckinService, type CheckinService } from "./checkin-service";
import { KEY_ENTITY } from "./key-codec";
import { createKeyRepository, type KeyRepository } from "./key-repository";
import { createReveal, type Reveal } from "./reveal";
import { ENTITY } from "./schedule-codec";
import { SEALED_ENTITY } from "./sealed-codec";
import {
  createSealedRepository,
  type SealedRepository,
} from "./sealed-repository";
import { createWindowEnd, weekOfChange, type WindowEnd } from "./window-sweep";
import {
  createScheduleRepository,
  type ScheduleRepository,
} from "./schedule-repository";

const wired = new WeakMap<
  Platform,
  {
    schedule: ScheduleRepository;
    sealed: SealedRepository;
    keys: KeyRepository;
    reveal: Reveal;
    windowEnd: WindowEnd;
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
 * The sync that sweeps after the end of the window before it collects, drops
 * what the partner sends for a closed week, and settles the lock and the
 * reveal after each merge.
 */
const settling = (
  sync: RecordHandlerSync,
  reveal: Pick<Reveal, "settle">,
  windowEnd: WindowEnd,
) => ({
  ...sync,
  collect: async (nextHlc: Parameters<RecordHandlerSync["collect"]>[0]) => {
    await windowEnd.sweep();
    return sync.collect(nextHlc);
  },
  merge: async (change: Parameters<RecordHandlerSync["merge"]>[0]) => {
    const week = weekOfChange(change);
    if (week === null || !(await windowEnd.closed(week))) {
      await sync.merge(change);
    }
    await reveal.settle();
  },
});

/**
 * Sync of the sealed versions of the check-ins (FR-CHK-03): the ciphertext
 * only, with the consent of CHECKIN. The pair that ends takes the received ones.
 */
export function createCheckinHandler(deps: {
  sealed: Pick<SealedRepository, "sync" | "subscribe" | "forgetReceived">;
  reveal: Pick<Reveal, "settle">;
  windowEnd: WindowEnd;
}) {
  const { sync, subscribe, forgetReceived } = deps.sealed;
  return createRecordHandler({
    entity: SEALED_ENTITY,
    category: "CHECKIN",
    sync: settling(sync, deps.reveal, deps.windowEnd),
    subscribe,
    forget: forgetReceived,
  });
}

/**
 * Sync of the keys of the sealed versions, sent once the check-in is locked
 * (spec 7.4 point 3), with the consent of CHECKIN. The pair that ends takes
 * the received keys and the revealed answers.
 */
export function createCheckinKeyHandler(deps: {
  keys: Pick<KeyRepository, "sync" | "subscribe" | "forgetReceived">;
  reveal: Pick<Reveal, "settle" | "forgetReceived">;
  windowEnd: WindowEnd;
}) {
  const { sync, subscribe, forgetReceived } = deps.keys;
  return createRecordHandler({
    entity: KEY_ENTITY,
    category: "CHECKIN",
    sync: settling(sync, deps.reveal, deps.windowEnd),
    subscribe,
    forget: async () => {
      await forgetReceived();
      await deps.reveal.forgetReceived();
    },
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
    pairs,
    sodium: platform.sodium,
  });
  const keys = createKeyRepository({ database: platform.database, pairs });
  const windowEnd = createWindowEnd({
    clock: platform.clock,
    schedule,
    database: platform.database,
    keys,
    sealed,
  });
  const reveal = createReveal({
    database: platform.database,
    sodium: platform.sodium,
    sealed,
    keys,
    window: windowEnd,
  });
  const checkin = createCheckinService({
    clock: platform.clock,
    pairs,
    schedule,
    answers: createAnswersRepository(platform.database),
    sealed,
    reveal,
    windowEnd,
  });
  const set = { schedule, sealed, keys, reveal, windowEnd, checkin };
  wired.set(platform, set);
  return set;
}
