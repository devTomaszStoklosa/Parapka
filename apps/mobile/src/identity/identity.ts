import {
  base64urlDecode,
  encodeDevicePublicKeys,
  generateDeviceKeys,
  type DevicePublicKeys,
  type Sodium,
} from "@parapka/crypto";

import type { LocalDatabase } from "../data/local-database";
import type { DeviceCredentials, RelayClient } from "../net/relay-client";
import { RelayError } from "../net/relay-error";
import type { KeyStore } from "../platform/key-store";

const COLLECTION = "identity";
const DEVICE_ID = "device";
const SIGNING_KEY = "identity/signing-private";
const AGREEMENT_KEY = "identity/agreement-private";

/** What the screens see: no keys, only whether the relay knows the device. */
export type IdentityState = "registered" | "waitingForNetwork";

interface DeviceRecord {
  readonly signingPublicKey: string;
  readonly agreementPublicKey: string;
  readonly deviceId: string | null;
  [key: string]: string | null;
}

export interface Identity {
  /** Makes the keys on the first launch and tries to register the device. */
  init(): Promise<IdentityState>;
  /** Retries the registration when it is still pending. */
  ensureRegistered(): Promise<IdentityState>;
  /** The id given by the relay, or null before the registration. */
  deviceId(): Promise<string | null>;
  publicKeys(): Promise<DevicePublicKeys | null>;
  /** For `createRelayClient`; null before the registration. */
  credentials(): Promise<DeviceCredentials | null>;
  /** Removes the keys and the device id (FR-SEC-04). */
  clear(): Promise<void>;
}

export interface IdentityDeps {
  readonly sodium: Sodium;
  readonly keyStore: KeyStore;
  readonly database: LocalDatabase;
  /** A client without credentials: `registerDevice` needs none. */
  readonly relay: () => Pick<RelayClient, "registerDevice">;
}

const loadRecord = async (database: LocalDatabase) =>
  (await database.get(COLLECTION, DEVICE_ID)) as DeviceRecord | null;

// Private keys go first, so a record in the database always has its keys.
async function createKeys(deps: IdentityDeps): Promise<DeviceRecord> {
  const keys = generateDeviceKeys(deps.sodium);
  await deps.keyStore.set(SIGNING_KEY, keys.signing.privateKey);
  await deps.keyStore.set(AGREEMENT_KEY, keys.agreement.privateKey);
  const text = encodeDevicePublicKeys({
    signing: keys.signing.publicKey,
    agreement: keys.agreement.publicKey,
  });
  const record: DeviceRecord = {
    signingPublicKey: text.signing,
    agreementPublicKey: text.agreement,
    deviceId: null,
  };
  await deps.database.put(COLLECTION, DEVICE_ID, record);
  return record;
}

async function register(deps: IdentityDeps): Promise<IdentityState> {
  const record = (await loadRecord(deps.database)) ?? (await createKeys(deps));
  if (record.deviceId !== null) return "registered";
  try {
    const { deviceId } = await deps
      .relay()
      .registerDevice(record.signingPublicKey);
    await deps.database.put(COLLECTION, DEVICE_ID, { ...record, deviceId });
    return "registered";
  } catch (error) {
    if (error instanceof RelayError && error.kind === "network") {
      return "waitingForNetwork";
    }
    throw error;
  }
}

export function createIdentity(deps: IdentityDeps): Identity {
  const { keyStore, database } = deps;
  let pending: Promise<IdentityState> | null = null;

  const ensureRegistered = () => {
    pending ??= register(deps).finally(() => {
      pending = null;
    });
    return pending;
  };

  return {
    init: ensureRegistered,
    ensureRegistered,
    deviceId: async () => (await loadRecord(database))?.deviceId ?? null,
    publicKeys: async () => {
      const record = await loadRecord(database);
      if (!record) return null;
      return {
        signing: base64urlDecode(record.signingPublicKey),
        agreement: base64urlDecode(record.agreementPublicKey),
      };
    },
    credentials: async () => {
      const record = await loadRecord(database);
      const signingPrivateKey = await keyStore.get(SIGNING_KEY);
      if (!record?.deviceId || !signingPrivateKey) return null;
      return { deviceId: record.deviceId, signingPrivateKey };
    },
    clear: async () => {
      await pending?.catch(() => undefined);
      await database.delete(COLLECTION, DEVICE_ID);
      await keyStore.delete(SIGNING_KEY);
      await keyStore.delete(AGREEMENT_KEY);
    },
  };
}
