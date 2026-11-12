import { createUuid7Generator } from "@parapka/domain";

import type { Platform } from "../platform/context";
import { wireChores } from "../sync/wiring";
import { createItemRepository } from "./item-repository";

export { createItemHandler } from "./item-handler";

const wired = new WeakMap<
  Platform,
  { items: ReturnType<typeof createItemRepository> }
>();

/**
 * The repositories of the "Head" panel of the platform: one set per platform,
 * on the identity and the pairs of the planner.
 */
export function wireHead(platform: Platform) {
  const known = wired.get(platform);
  if (known) return known;
  const { pairs } = wireChores(platform);
  const { sodium, clock } = platform;
  const random = { bytes: (length: number) => sodium.randomBytes(length) };
  const newId = createUuid7Generator({ clock, random });
  const set = {
    items: createItemRepository({
      database: platform.database,
      pairs,
      clock,
      newId,
    }),
  };
  wired.set(platform, set);
  return set;
}
