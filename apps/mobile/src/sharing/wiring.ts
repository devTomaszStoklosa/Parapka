import { wireChores } from "../chores/wiring";
import { wireConsent } from "../consent/wiring";
import { wireHead } from "../head/wiring";
import type { Platform } from "../platform/context";
import {
  createSharePrivateService,
  type SharePrivateService,
} from "./share-private";

const wired = new WeakMap<Platform, SharePrivateService>();

/**
 * The service that hands private chores and things over to the partner: one
 * per platform, on the repositories the screens and the synchronization use.
 */
export function wireSharePrivate(platform: Platform) {
  const known = wired.get(platform);
  if (known) return known;
  const { pairs, chores, completions } = wireChores(platform);
  const { items, carriers } = wireHead(platform);
  const { consent } = wireConsent(platform);
  const service = createSharePrivateService({
    database: platform.database,
    pairs,
    consent,
    chores,
    completions,
    items,
    carriers,
  });
  wired.set(platform, service);
  return service;
}
