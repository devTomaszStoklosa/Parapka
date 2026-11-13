import { afterEach, expect, it, vi } from "vitest";

import { defaultConsent } from "../consent/consent-model";
import {
  isRun,
  profile,
  runsAfter,
  setup,
  SLOW,
  start,
  stoppers,
  tick,
} from "./wiring-test-support";
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
  const first = set.nextCall(isRun);
  start(set.controller);
  await first;
  await tick();
  return set;
}

it(
  "synchronizes after each local change of a chore and a check-off",
  async () => {
    const set = await running();
    const { chores, completions } = wireChores(set.platform);
    let id = "";
    await runsAfter(set, async () => {
      id = (await chores.add(input)).id;
    });
    await runsAfter(set, () => chores.edit(id, { title: "Nowy" }));
    await runsAfter(set, () => completions.complete(id, "2026-01-05"));
    await runsAfter(set, () => completions.undo(id, "2026-01-05"));
    await runsAfter(set, () => chores.remove(id));
    await runsAfter(set, () => chores.restore(id));
  },
  SLOW,
);

it("asks for a run on the notice of a handler with subscribe", async () => {
  const set = await running();
  await runsAfter(set, () => {
    probe.notify();
    return Promise.resolve();
  });
});

it(
  "does not ask for a run for a handler without subscribe",
  async () => {
    const set = await running();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const settled = set.syncs();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(set.syncs()).toBe(settled);
    await runsAfter(set, () => {
      probe.notify();
      return Promise.resolve();
    });
  },
  SLOW,
);

it("settles after merging a change of the partner without sending", async () => {
  const set = await setup(
    200,
    false,
    [],
    [
      {
        entity: "Chore",
        id: "p-1",
        op: "upsert",
        fields: Object.fromEntries(
          Object.entries({ ...input, title: "Od partnera" }).map(
            ([name, value]) => [
              name,
              { value, hlc: "000000000000002-00000-partner" },
            ],
          ),
        ),
      },
    ],
  );
  await set.pair();
  await set.consent.save(defaultConsent(profile));
  const ran = set.nextCall(isRun);
  start(set.controller);
  await ran;
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const settled = set.syncs();
  expect(settled).toBeLessThanOrEqual(3);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  expect(set.syncs()).toBe(settled);
  expect(set.posts()).toBe(0);
  const merged = await wireChores(set.platform).chores.list();
  expect(merged.map((chore) => chore.title)).toEqual(["Od partnera"]);
});

it(
  "settles: the runs stop when nothing changes",
  async () => {
    const set = await running();
    const { chores } = wireChores(set.platform);
    await runsAfter(set, () => chores.add(input));
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const settled = set.syncs();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(set.syncs()).toBe(settled);
  },
  SLOW,
);
