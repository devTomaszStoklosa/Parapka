import { createUuid7Generator } from "@parapka/domain";

import { createIdentity, type Identity } from "../identity/identity";
import { createRelayClient, type DeviceCredentials } from "../net/relay-client";
import { createPairRepository } from "../pairing/pair-repository";
import type { Platform } from "../platform/context";
import { createChoreRepository } from "./chore-repository";
import { createCompletionRepository } from "./completion-repository";

function buildChores(platform: Platform) {
  const { database, sodium, sha256, keyStore, clock } = platform;
  const client = (credentials?: DeviceCredentials) =>
    createRelayClient({
      baseUrl: platform.relayUrl,
      fetch: (url, init) => globalThis.fetch(url, init),
      sodium,
      sha256,
      ...(credentials ? { credentials } : {}),
    });
  const relayIdentity = createIdentity({
    sodium,
    keyStore,
    database,
    relay: client,
  });
  // The repositories read deviceId() on every write: the local keys come first.
  const identity: Identity = {
    ...relayIdentity,
    deviceId: async () => {
      await relayIdentity.ensureLocal();
      return relayIdentity.deviceId();
    },
  };
  const pairs = createPairRepository(database, keyStore);
  const random = { bytes: (length: number) => sodium.randomBytes(length) };
  const newId = createUuid7Generator({ clock, random });
  const chores = createChoreRepository({ database, pairs, identity, newId });
  const completions = createCompletionRepository({
    database,
    chores,
    identity,
    clock,
  });
  return { client, identity, pairs, chores, completions };
}

const wiredChores = new WeakMap<Platform, ReturnType<typeof buildChores>>();

/**
 * The identity, pair, chore and check-off repositories of the platform: one set
 * per platform, so the screens and the synchronization share the instances.
 */
export function wireChores(platform: Platform) {
  const set = wiredChores.get(platform) ?? buildChores(platform);
  wiredChores.set(platform, set);
  return set;
}
