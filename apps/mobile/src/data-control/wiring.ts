import { wireChores } from "../chores/wiring";
import type { Platform } from "../platform/context";
import { wireSync } from "../sync/wiring";
import type { DeleteAllDeps } from "./delete-all";

/** The dependencies of `deleteAllData` made of the real modules of the platform. */
export function wireDeleteAll(
  platform: Platform,
  options: { localOnly?: boolean } = {},
): DeleteAllDeps {
  const { database, keyStore } = platform;
  const { pairs, identity, client } = wireChores(platform);
  return {
    database,
    keyStore,
    pairs,
    disconnect: () => wireSync(platform).disconnect(),
    credentials: () => identity.credentials(),
    client,
    ...options,
  };
}
