import type { LocalDatabase } from "../data/local-database";
import { resetApp } from "../lock/reset";
import type { DeviceCredentials, RelayClient } from "../net/relay-client";
import { RelayError } from "../net/relay-error";
import type { PairRepository } from "../pairing/pair-repository";
import type { KeyStore } from "../platform/key-store";
import { CLOSING } from "../sync/engine-state";

export interface DeleteAllDeps {
  readonly database: LocalDatabase;
  readonly keyStore: KeyStore;
  readonly pairs: Pick<PairRepository, "activePair">;
  /** Ends the pair and tries to close its mailbox (FR-PAIR-07). */
  readonly disconnect: () => Promise<void>;
  /** The credentials of this device, or null when it is not registered. */
  readonly credentials: () => Promise<DeviceCredentials | null>;
  readonly client: (
    credentials: DeviceCredentials,
  ) => Pick<RelayClient, "deleteDevice" | "fetchEnvelopes">;
  /** Wipes the phone only; the relay forgets the device by retention. */
  readonly localOnly?: boolean;
}

/** The relay no longer knows the device: there is nothing left to delete. */
function isGone(error: unknown): boolean {
  return (
    error instanceof RelayError &&
    (error.kind === "notFound" || error.kind === "unauthorized")
  );
}

/** Removes the device on the relay; false on a network or server error. */
async function deleteRemoteDevice(deps: DeleteAllDeps): Promise<boolean> {
  const credentials = await deps.credentials();
  if (credentials === null) return true;
  try {
    await deps.client(credentials).deleteDevice();
    return true;
  } catch (error) {
    return isGone(error);
  }
}

/**
 * A read-only signed request: false when the relay cannot be reached, so the
 * pair is not ended on this phone while the partner cannot be told.
 */
async function relayReachable(
  deps: DeleteAllDeps,
  pairMailboxId: string,
): Promise<boolean> {
  const credentials = await deps.credentials();
  if (credentials === null) return true;
  try {
    await deps.client(credentials).fetchEnvelopes(pairMailboxId, null);
    return true;
  } catch (error) {
    return isGone(error);
  }
}

/**
 * Deletes all data of the person (FR-SEC-04). The order matters: the relay
 * removes the open mailbox of a deleted device with its envelopes, so the
 * device goes only after the mailbox is closed and the command of the
 * disconnect has been delivered. "offline" leaves everything on the phone, so
 * the person can try again.
 */
export async function deleteAllData(
  deps: DeleteAllDeps,
): Promise<"done" | "offline"> {
  if (deps.localOnly !== true) {
    const pair = await deps.pairs.activePair();
    if (pair !== null) {
      if (!(await relayReachable(deps, pair.pairMailboxId))) return "offline";
      await deps.disconnect();
    }
    // The marker stays after a failed closing, also when the pair is gone.
    if ((await deps.database.get(CLOSING.collection, CLOSING.id)) !== null) {
      return "offline";
    }
    if (!(await deleteRemoteDevice(deps))) return "offline";
  }
  await resetApp(deps);
  return "done";
}
