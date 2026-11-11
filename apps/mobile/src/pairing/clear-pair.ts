import type { ConsentRepository } from "../consent/consent-repository";
import type { LocalDatabase } from "../data/local-database";
import { clearEngineState } from "../sync/engine-state";
import type { HandlerRegistry } from "../sync/handler-registry";
import type { PairRepository } from "./pair-repository";

export interface ClearPairDeps {
  readonly database: LocalDatabase;
  readonly registry: HandlerRegistry;
  readonly pairs: Pick<PairRepository, "remove">;
  readonly consent: Pick<ConsentRepository, "clear">;
}

/**
 * Local cleanup after the pair is over (FR-PAIR-07): what came from the
 * partner goes, the shared items turn private, then the consent, the state of
 * the engine, the pair and its keys go. The queue of sending stays. Running
 * it again changes nothing.
 */
export async function clearPairLocally(deps: ClearPairDeps): Promise<void> {
  const { database, registry, pairs, consent } = deps;
  for (const handler of registry.all()) {
    await handler.forgetReceived?.();
    await handler.disconnected?.();
  }
  await consent.clear();
  await clearEngineState(database);
  await pairs.remove();
}
