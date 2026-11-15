import { createUuid7Generator } from "@parapka/domain";

import { wireCheckin } from "../checkin/wiring";
import { createProfileRepository } from "../data/profile-repository";
import type { Platform } from "../platform/context";
import { loadContent } from "./content";
import { createCycleRepository } from "./cycle-repository";
import { createCycleService, type CycleService } from "./cycle-service";
import { createHintChoice, type HintChoice } from "./hint-choice";
import { createHintGenerator, type HintGenerator } from "./hint-generator";
import {
  createHintFeedbackRepository,
  followFirstHint,
  type HintFeedbackRepository,
} from "./hint-feedback-repository";
import {
  createHintReactionRepository,
  type HintReactionRepository,
} from "./hint-reaction-repository";
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
  reactions: HintReactionRepository;
  feedback: HintFeedbackRepository;
  generator: HintGenerator;
  choice: HintChoice;
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
  const reactions = createHintReactionRepository(database);
  const feedback = createHintFeedbackRepository(database);
  followFirstHint(hints, feedback);
  const profiles = createProfileRepository(database);
  const { checkin } = wireCheckin(platform);
  const generatorDeps = {
    cycle: service,
    checkin,
    hints,
    profiles,
    library: () => loadContent(),
  };
  const generator = createHintGenerator(generatorDeps);
  const choice = createHintChoice(generatorDeps);
  // The hints follow the cycle data, the entries, the own check-in and the form.
  generator.start([
    { subscribe: (listener) => service.subscribe(listener) },
    { subscribe: (listener) => service.subscribeWellbeing(listener) },
    checkin,
    profiles,
  ]);
  return { service, hints, received, reactions, feedback, generator, choice };
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
  const { hints, received, reactions, generator, choice, service } =
    wiredOf(platform);
  return {
    hints,
    received,
    reactions,
    generator,
    choice,
    today: () => service.today(),
  };
}

/** The answers of the survey on the hints: local only, never synchronised. */
export function wireHintFeedback(platform: Platform): HintFeedbackRepository {
  return wiredOf(platform).feedback;
}
