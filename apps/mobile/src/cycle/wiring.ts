import { createUuid7Generator } from "@parapka/domain";

import { wireCheckin } from "../checkin/wiring";
import { createProfileRepository } from "../data/profile-repository";
import type { Platform } from "../platform/context";
import { loadContent } from "./content";
import { createCycleRepository } from "./cycle-repository";
import { createCycleService, type CycleService } from "./cycle-service";
import { createHintGenerator, type HintGenerator } from "./hint-generator";
import { createHintRepository, type HintRepository } from "./hint-repository";
import {
  createReceivedHintRepository,
  type ReceivedHintRepository,
} from "./received-hint-repository";
import { createWellbeingRepository } from "./wellbeing-repository";

interface Wired {
  service: CycleService;
  hints: HintRepository;
  received: ReceivedHintRepository;
  generator: HintGenerator;
}

const wired = new WeakMap<Platform, Wired>();

function build(platform: Platform): Wired {
  const { database, clock, sodium } = platform;
  const service = createCycleService({
    clock,
    repository: createCycleRepository(database),
    wellbeing: createWellbeingRepository(database),
  });
  const random = { bytes: (length: number) => sodium.randomBytes(length) };
  const hints = createHintRepository({
    database,
    newId: createUuid7Generator({ clock, random }),
  });
  const received = createReceivedHintRepository({
    database,
    today: () => service.today(),
  });
  const profiles = createProfileRepository(database);
  const { checkin } = wireCheckin(platform);
  const generator = createHintGenerator({
    cycle: service,
    checkin,
    hints,
    profiles,
    library: () => loadContent(),
  });
  // The hints follow the cycle data, the entries, the own check-in and the form.
  generator.start([
    { subscribe: (listener) => service.subscribe(listener) },
    { subscribe: (listener) => service.subscribeWellbeing(listener) },
    checkin,
    profiles,
  ]);
  return { service, hints, received, generator };
}

function wiredOf(platform: Platform): Wired {
  const known = wired.get(platform);
  if (known) return known;
  const set = build(platform);
  wired.set(platform, set);
  return set;
}

/**
 * The cycle facade of the platform: one per platform. The data stays in the
 * local database; the own hints are made from it after every change.
 */
export function wireCycle(platform: Platform): CycleService {
  return wiredOf(platform).service;
}

/** The own and the received hints, the generator and the day, for the screens and the sync. */
export function wireCycleHints(platform: Platform) {
  const { hints, received, generator, service } = wiredOf(platform);
  return { hints, received, generator, today: () => service.today() };
}
