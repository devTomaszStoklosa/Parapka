import { expect, it } from "vitest";

import { createChoreHandler } from "../chores/chore-handler";
import { createChoreRepository } from "../chores/chore-repository";
import { ME, WEEKDAYS, withChores } from "../chores/chore-test-support";
import { createMemoryDatabase } from "../data/memory-database";
import { createIdentity } from "../identity/identity";
import { createPairRepository } from "../pairing/pair-repository";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { createHandlerRegistry } from "./handler-registry";
import { createSyncEngine } from "./sync-engine";
import {
  createPairedDevices,
  createTickingClock,
  MAILBOX,
} from "./sync-test-support";

it("passes on a chore saved after a local start, and the partner knows who 'me' was", async () => {
  const { a: other, b, relay, sodium } = await createPairedDevices();
  const ub = withChores(b);

  // A device that never reached the relay: its id comes from its keys alone.
  const database = createMemoryDatabase();
  const keyStore = createMemoryKeyStore();
  const identity = createIdentity({
    sodium,
    keyStore,
    database,
    relay: () => {
      throw new Error("the relay must not be called");
    },
  });
  await identity.ensureLocal();
  const id = await identity.deviceId();
  if (id === null) throw new Error("no local id");

  const pairs = createPairRepository(database, keyStore);
  let counter = 0;
  const chores = createChoreRepository({
    database,
    pairs,
    identity,
    newId: () => `local-${String((counter += 1))}`,
  });
  const alone = await chores.add({
    title: "Przed parą",
    rule: WEEKDAYS,
    assignment: ME,
  });
  expect(alone.shared).toBe(false);

  await pairs.savePending(
    {
      pairMailboxId: MAILBOX,
      deviceId: b.id,
      signingPublicKey: "signing",
      agreementPublicKey: "agreement",
    },
    other.keys,
  );
  await pairs.confirm();
  const registry = createHandlerRegistry();
  registry.register(createChoreHandler({ chores }));
  const engine = createSyncEngine({
    database,
    pairs,
    identity,
    sodium,
    clock: createTickingClock(),
    transport: relay.connect(id),
    registry,
  });
  const shared = await chores.add({
    title: "Po parze",
    rule: WEEKDAYS,
    assignment: ME,
  });
  expect(shared.shared).toBe(true);

  await engine.sync();
  await b.engine.sync();

  // Only the shared chore arrives, and A's "me" is B's "partner".
  expect(await ub.chores.list()).toMatchObject([
    { title: "Po parze", assignment: { kind: "person", person: "partner" } },
  ]);
  expect(await chores.list()).toHaveLength(2);
});
