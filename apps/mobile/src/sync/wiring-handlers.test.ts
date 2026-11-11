import { afterEach, expect, it, vi } from "vitest";

import { defaultConsent } from "../consent/consent-model";
import { setup, start, stoppers, tick, profile } from "./wiring-test-support";
import { wireChores } from "./wiring";

const probe = vi.hoisted(() => ({ notify: () => {} }));

vi.mock("./handler-registry", async (importOriginal) => {
  const original = await importOriginal<typeof import("./handler-registry")>();
  return {
    ...original,
    createHandlerRegistry: () => {
      const registry = original.createHandlerRegistry();
      const base = {
        category: null,
        apply: () => Promise.resolve(),
        collect: () => Promise.resolve([]),
      };
      registry.register({ ...base, entity: "Plain" });
      registry.register({
        ...base,
        entity: "Noisy",
        subscribe: (listener) => {
          probe.notify = listener;
          return () => {};
        },
      });
      return registry;
    },
  };
});

afterEach(() => {
  for (const stop of stoppers.splice(0)) stop();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const input = {
  title: "Podlać kwiaty",
  rule: { kind: "daily" },
  assignment: { kind: "anyone" },
} as const;

/** A running session whose first run is over. */
async function running() {
  const set = await setup();
  await set.pair();
  await set.consent.save(defaultConsent(profile));
  start(set.controller);
  await vi.waitFor(() => {
    expect(set.syncs()).toBeGreaterThan(0);
  });
  await tick();
  return set;
}

/** Waits for a run after `action`, long before the cyclic one. */
async function runsAfter(syncs: () => number, action: () => Promise<unknown>) {
  await tick();
  const before = syncs();
  await action();
  await vi.waitFor(
    () => {
      expect(syncs()).toBeGreaterThan(before);
    },
    { timeout: 3000 },
  );
}

it("synchronizes after each local change of a chore and a check-off", async () => {
  const { syncs, platform } = await running();
  const { chores, completions } = wireChores(platform);
  let id = "";
  await runsAfter(syncs, async () => {
    id = (await chores.add(input)).id;
  });
  await runsAfter(syncs, () => chores.edit(id, { title: "Nowy" }));
  await runsAfter(syncs, () => completions.complete(id, "2026-01-05"));
  await runsAfter(syncs, () => completions.undo(id, "2026-01-05"));
  await runsAfter(syncs, () => chores.remove(id));
  await runsAfter(syncs, () => chores.restore(id));
});

it("asks for a run on the notice of a handler with subscribe", async () => {
  const { syncs } = await running();
  await runsAfter(syncs, () => {
    probe.notify();
    return Promise.resolve();
  });
});

it("settles: the runs stop when nothing changes", async () => {
  const { syncs, platform } = await running();
  const { chores } = wireChores(platform);
  await runsAfter(syncs, () => chores.add(input));
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const settled = syncs();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  expect(syncs()).toBe(settled);
});
