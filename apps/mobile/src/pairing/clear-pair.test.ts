import { expect, it } from "vitest";

import { defaultConsent } from "../consent/consent-model";
import { createConsentRepository } from "../consent/consent-repository";
import { createProfileRepository } from "../data/profile-repository";
import { createHandlerRegistry } from "../sync/handler-registry";
import { createPairedDevices } from "../sync/sync-test-support";
import { clearPairLocally } from "./clear-pair";

async function setup() {
  const { b } = await createPairedDevices();
  const consent = createConsentRepository({
    database: b.database,
    clock: { nowMs: () => 1 },
    profiles: createProfileRepository(b.database),
  });
  await consent.save(
    defaultConsent({ cycle: "no", shareGoalsWithPartner: false }),
  );
  const registry = createHandlerRegistry();
  registry.register(b.handler);
  const deps = {
    database: b.database,
    registry,
    pairs: b.pairs,
    consent,
  };
  return { b, consent, deps };
}

it("calls the hooks of every handler and removes the pair, the keys and the consent", async () => {
  const { b, consent, deps } = await setup();
  await clearPairLocally(deps);
  expect(b.handler.forgotten).toBe(1);
  expect(b.handler.disconnectedCount).toBe(1);
  expect(await b.pairs.current()).toBeNull();
  expect(await b.pairs.keys()).toBeNull();
  expect(await consent.current()).toBeNull();
});

it("clears the state of the engine and leaves the queue of sending", async () => {
  const { b, deps } = await setup();
  await b.database.put("sync-state", "cursor", { after: "c1" });
  await b.database.put("sync-applied", "e1", { atMs: 1 });
  await b.database.put("sync-held", "e2", { kind: "unknown-entity" });
  await b.database.put("sync-errors", "r1", { reason: "decrypt-failed" });
  await b.database.put("sync-outbox", "e3", { envelopeId: "e3" });

  await clearPairLocally(deps);

  expect(await b.database.get("sync-state", "cursor")).toBeNull();
  expect(await b.database.list("sync-applied")).toEqual([]);
  expect(await b.database.list("sync-held")).toEqual([]);
  expect(await b.database.list("sync-errors")).toEqual([]);
  expect(await b.engine.pending()).toBe(1);
});

it("is harmless when run again", async () => {
  const { b, deps } = await setup();
  await clearPairLocally(deps);
  await clearPairLocally(deps);
  expect(await b.pairs.current()).toBeNull();
  expect(await b.pairs.keys()).toBeNull();
});

it("works without any handler hooks", async () => {
  const { b, deps } = await setup();
  const registry = createHandlerRegistry();
  registry.register({
    entity: "Bare",
    category: null,
    apply: () => Promise.resolve(),
    collect: () => Promise.resolve([]),
  });
  await clearPairLocally({ ...deps, registry });
  expect(await b.pairs.current()).toBeNull();
});
