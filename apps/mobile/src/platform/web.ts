import { createIndexedDbDatabase } from "../data/indexeddb-database";
import { systemClock } from "./clock";
import type { Platform } from "./context";
import { createIndexedDbKeyStore } from "./indexeddb-key-store";
import { configuredRelayUrl } from "../net/relay-config";
import { createLaunchLinkReader } from "./launch-link";
import type { SocketLike } from "../net/relay-socket";
import { webSha256 } from "./sha256";
import { createWebSodium } from "./web-sodium";

/**
 * Creates the platform dependencies for the browser. Keys live in IndexedDB
 * without hardware protection: tests and browser-first work only (native: M9).
 */
export async function createWebPlatform(): Promise<Platform> {
  const sodium = await createWebSodium();
  const keyStore = createIndexedDbKeyStore();
  return {
    sodium,
    keyStore,
    clock: systemClock,
    database: createIndexedDbDatabase({ sodium, keyStore }),
    sha256: webSha256,
    relayUrl: configuredRelayUrl(),
    appUrl: location.origin,
    createSocket: (url) => new WebSocket(url) as SocketLike,
    launchInvitation: createLaunchLinkReader(location, history),
  };
}
