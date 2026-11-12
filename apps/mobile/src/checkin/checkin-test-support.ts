import type { ConsentCategory } from "../consent/consent-model";
import { createHandlerRegistry } from "../sync/handler-registry";
import { createPairedDevices, type Device } from "../sync/sync-test-support";
import { createScheduleRepository } from "./schedule-repository";
import { createScheduleHandler } from "./wiring";

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
