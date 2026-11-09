import { systemClock } from "./clock";
import type { Platform } from "./context";
import { createIndexedDbKeyStore } from "./indexeddb-key-store";
import { createWebSodium } from "./web-sodium";

/**
 * Creates the platform dependencies for the browser. Keys live in IndexedDB
 * without hardware protection: tests and browser-first work only (native: M9).
 */
export async function createWebPlatform(): Promise<Platform> {
  return {
    sodium: await createWebSodium(),
    keyStore: createIndexedDbKeyStore(),
    clock: systemClock,
  };
}
