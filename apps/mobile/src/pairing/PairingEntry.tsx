import { computeSafetyCode, decodeDevicePublicKeys } from "@parapka/crypto";
import { useEffect, useState } from "react";

import { t } from "../i18n";
import { createIdentity } from "../identity/identity";
import {
  createRelayClient,
  type DeviceCredentials,
  type RelayFetch,
} from "../net/relay-client";
import { usePlatform, type Platform } from "../platform/context";
import { AppText } from "../ui/AppText";
import { createInviter, type Inviter } from "./inviter";
import { createPairRepository, type PairRepository } from "./pair-repository";
import { PairingScreen } from "./PairingScreen";

interface Wiring {
  inviter: Inviter;
  pairs: PairRepository;
  loadSafetyCode: () => Promise<string>;
}

/** Builds the real dependencies; null when the device is not registered with the relay. */
async function wire(platform: Platform): Promise<Wiring | null> {
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
  return { inviter, pairs, loadSafetyCode };
}

/** The Pair section with the real dependencies of the platform. */
export function PairingEntry() {
  const platform = usePlatform();
  const [wiring, setWiring] = useState<Wiring | null | "loading">("loading");

  useEffect(() => {
    let active = true;
    void wire(platform).then((result) => {
      if (active) setWiring(result);
    });
    return () => {
      active = false;
    };
  }, [platform]);

  if (wiring === "loading") return null;
  if (wiring === null) {
    return (
      <AppText accessibilityRole="alert">{t("pairing.unavailable")}</AppText>
    );
  }
  return <PairingScreen {...wiring} />;
}
