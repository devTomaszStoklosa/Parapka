import { computeSafetyCode, decodeDevicePublicKeys } from "@parapka/crypto";
import { useCallback, useEffect, useState } from "react";

import { createIdentity } from "../identity/identity";
import {
  createRelayClient,
  type DeviceCredentials,
  type RelayFetch,
} from "../net/relay-client";
import type { Platform } from "../platform/context";
import { createAcceptor, type Acceptor } from "./acceptor";
import { createInviter, type Inviter } from "./inviter";
import { createPairRepository, type PairRepository } from "./pair-repository";

export interface Wiring {
  inviter: Inviter;
  acceptor: Acceptor;
  pairs: PairRepository;
  loadSafetyCode: () => Promise<string>;
}

/** Builds the real dependencies; null when the device is not registered with the relay. */
export async function wire(platform: Platform): Promise<Wiring | null> {
  const { sodium, keyStore, database, sha256, clock } = platform;
  const fetch: RelayFetch = (url, init) => globalThis.fetch(url, init);
  const client = (credentials?: DeviceCredentials) =>
    createRelayClient({
      baseUrl: platform.relayUrl,
      fetch,
      sodium,
      sha256,
      ...(credentials ? { credentials } : {}),
    });
  const identity = createIdentity({
    sodium,
    keyStore,
    database,
    relay: () => client(),
  });
  if ((await identity.ensureRegistered()) !== "registered") return null;
  const credentials = await identity.credentials();
  if (!credentials) return null;
  const pairs = createPairRepository(database, keyStore);
  const inviter = createInviter({
    sodium,
    relay: client(credentials),
    identity,
    pairs,
    clock,
    appUrl: platform.appUrl,
  });
  const acceptor = createAcceptor({
    sodium,
    relay: client(credentials),
    identity,
    pairs,
  });
  const loadSafetyCode = async () => {
    const pair = await pairs.current();
    const own = await identity.publicKeys();
    if (!pair || !own) throw new Error("There is no pair to compare");
    const peer = decodeDevicePublicKeys({
      signing: pair.signingPublicKey,
      agreement: pair.agreementPublicKey,
    });
    return computeSafetyCode(sodium, own, peer);
  };
  return { inviter, acceptor, pairs, loadSafetyCode };
}

/**
 * The real dependencies of the platform: "loading" while they are built, null
 * when the relay cannot be reached. `retry` builds them again.
 */
export function usePairingWiring(platform: Platform) {
  const [wiring, setWiring] = useState<Wiring | null | "loading">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setWiring("loading");
    void wire(platform)
      .catch(() => null)
      .then((result) => {
        if (active) setWiring(result);
      });
    return () => {
      active = false;
    };
  }, [platform, attempt]);

  const retry = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);
  return { wiring, retry };
}
