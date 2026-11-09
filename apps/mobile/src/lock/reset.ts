import type { LocalDatabase } from "../data/local-database";
import type { KeyStore } from "../platform/key-store";

/** Forgotten PIN without biometrics: removes all local data and keys (FR-SEC-06). */
export async function resetApp(deps: {
  database: LocalDatabase;
  keyStore: KeyStore;
}): Promise<void> {
  await deps.database.clear();
  await deps.keyStore.clear();
}
