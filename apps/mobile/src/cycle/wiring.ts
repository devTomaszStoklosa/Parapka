import type { Platform } from "../platform/context";
import { createCycleRepository } from "./cycle-repository";
import { createCycleService, type CycleService } from "./cycle-service";

const wired = new WeakMap<Platform, CycleService>();

/**
 * The cycle facade of the platform: one per platform. The data stays in the
 * local database; nothing of it is registered for synchronization.
 */
export function wireCycle(platform: Platform): CycleService {
  const known = wired.get(platform);
  if (known) return known;
  const service = createCycleService({
    clock: platform.clock,
    repository: createCycleRepository(platform.database),
  });
  wired.set(platform, service);
  return service;
}
