import type { ConsentCategory } from "../consent/consent-model";
import { createHandlerRegistry } from "../sync/handler-registry";
import type { Sodium } from "@parapka/crypto";
import type { Clock } from "@parapka/domain";

import { createPairedDevices, type Device } from "../sync/sync-test-support";
import { createAnswersRepository } from "./answers-repository";
import { createCheckinService } from "./checkin-service";
import { createScheduleRepository } from "./schedule-repository";
import { createSealedRepository } from "./sealed-repository";
import { createKeyRepository } from "./key-repository";
import { createReveal } from "./reveal";
import {
  createCheckinHandler,
  createCheckinKeyHandler,
  createScheduleHandler,
} from "./wiring";

export { exchange } from "../chores/chore-test-support";

interface Gates {
  isShared?: (category: ConsentCategory) => boolean;
  isPaused?: () => boolean;
}

/** The repository and the handler of a device, as the engine will run them. */
export function withSchedule(device: Device, gates: Gates = {}) {
  const schedule = createScheduleRepository({
    database: device.database,
    pairs: device.pairs,
  });
  const registry = createHandlerRegistry();
  registry.register(createScheduleHandler({ schedule }));
  device.restart({ registry, ...gates });
  return { schedule, registry };
}

/** Two paired devices with the real schedule repositories and handlers. */
export async function setupSchedulePair(gates: Gates = {}) {
  const devices = await createPairedDevices();
  const ua = withSchedule(devices.a, gates);
  const ub = withSchedule(devices.b, gates);
  return { ...devices, sa: ua.schedule, sb: ub.schedule, ua, ub };
}

/** The repositories, the handlers and the service of a device. */
export function withCheckin(
  device: Device,
  sodium: Sodium,
  clock: Clock,
  gates: Gates = {},
) {
  const sealed = createSealedRepository({
    database: device.database,
    identity: { deviceId: () => Promise.resolve(device.id) },
    sodium,
  });
  const keys = createKeyRepository({
    database: device.database,
    identity: { deviceId: () => Promise.resolve(device.id) },
  });
  const reveal = createReveal({
    database: device.database,
    sodium,
    sealed,
    keys,
  });
  const schedule = createScheduleRepository({
    database: device.database,
    pairs: device.pairs,
  });
  const service = createCheckinService({
    clock,
    pairs: device.pairs,
    schedule,
    answers: createAnswersRepository(device.database),
    sealed,
    reveal,
  });
  const registry = createHandlerRegistry();
  registry.register(createCheckinHandler({ sealed, reveal }));
  registry.register(createCheckinKeyHandler({ keys, reveal }));
  device.restart({ registry, ...gates });
  return { sealed, keys, reveal, service, registry };
}

/** Two paired devices with the check-in services, the CHECKIN consent given. */
export async function setupCheckinPair(gates: Gates = {}) {
  const devices = await createPairedDevices();
  const clock: Clock = { nowMs: () => new Date("2026-11-12T12:00").getTime() };
  const ua = withCheckin(devices.a, devices.sodium, clock, gates);
  const ub = withCheckin(devices.b, devices.sodium, clock, gates);
  return { ...devices, ua, ub };
}
