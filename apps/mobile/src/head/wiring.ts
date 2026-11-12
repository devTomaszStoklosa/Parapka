import { createUuid7Generator } from "@parapka/domain";

import { wireChores } from "../chores/wiring";
import type { Platform } from "../platform/context";
import { createCarrierRepository } from "./carrier-repository";
import { createHandoverRepository } from "./handover-repository";
import { createHandoverService } from "./handover-service";
import { createHeadService } from "./head-service";
import { createItemRepository } from "./item-repository";

export { createCarrierHandler } from "./carrier-handler";
export { createHandoverHandler } from "./handover-handler";
export { createItemHandler } from "./item-handler";

const wired = new WeakMap<
  Platform,
  {
    items: ReturnType<typeof createItemRepository>;
    carriers: ReturnType<typeof createCarrierRepository>;
    head: ReturnType<typeof createHeadService>;
    handovers: ReturnType<typeof createHandoverRepository>;
    handover: ReturnType<typeof createHandoverService>;
  }
>();

/**
 * The repositories and the service of the "Head" panel of the platform: one
 * set per platform, on the identity and the pairs of the planner.
 */
export function wireHead(platform: Platform) {
  const known = wired.get(platform);
  if (known) return known;
  const { pairs, identity } = wireChores(platform);
  const { sodium, clock, database } = platform;
  const random = { bytes: (length: number) => sodium.randomBytes(length) };
  const newId = createUuid7Generator({ clock, random });
  const items = createItemRepository({ database, pairs, clock, newId });
  const carriers = createCarrierRepository({ database, identity, clock });
  const head = createHeadService({ items, carriers, pairs, identity, clock });
  const handovers = createHandoverRepository({ database, identity, clock });
  const handover = createHandoverService({
    handovers,
    carriers,
    head,
    pairs,
    identity,
    newId,
  });
  const set = { items, carriers, head, handovers, handover };
  wired.set(platform, set);
  return set;
}
