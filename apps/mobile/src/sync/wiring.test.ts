import { afterEach, expect, it, vi } from "vitest";

import { defaultConsent } from "../consent/consent-model";
import { createPauseRepository } from "./pause-repository";
import {
  CYCLE,
  isRun,
  profile,
  runsAfter,
  setup,
  SLOW,
  start,
  stoppers,
  tick,
} from "./wiring-test-support";
import { wireChores, wireSync } from "./wiring";

const made = vi.hoisted(
  () => [] as { all: () => readonly { entity: string }[] }[],
);

const choreDeps = vi.hoisted(() => [] as { newId: () => string }[]);

vi.mock("../chores/chore-repository", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../chores/chore-repository")>();
  return {
    ...original,
    createChoreRepository: (
      deps: Parameters<typeof original.createChoreRepository>[0],
    ) => {
      choreDeps.push(deps);
      return original.createChoreRepository(deps);
    },
  };
});

vi.mock("./handler-registry", async (importOriginal) => {
  const original = await importOriginal<typeof import("./handler-registry")>();
  return {
    ...original,
    createHandlerRegistry: () => {
      const registry = original.createHandlerRegistry();
      made.push(registry);
      return registry;
    },
  };
});

afterEach(() => {
  for (const stop of stoppers.splice(0)) stop();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("registers the handlers of the chores and of their check-offs", async () => {
  await setup();
  const entities = made.flatMap((registry) =>
    registry.all().map(({ entity }) => entity),
  );
  expect(entities).toContain("Chore");
  expect(entities).toContain("ChoreCompletion");
});

it("draws the ids of the chores from the random bytes of the platform", async () => {
  await setup();
  const deps = choreDeps.at(-1);
  expect(deps?.newId()).not.toBe(deps?.newId());
});

it("gives the screens the repositories of the synchronization", async () => {
  const { platform } = await setup();
  const made = choreDeps.length;
  expect(wireChores(platform)).toBe(wireChores(platform));
  expect(choreDeps).toHaveLength(made);
});

it("gives one controller for one platform", async () => {
  const { platform, controller } = await setup();
  expect(wireSync(platform)).toBe(controller);
});

it(
  "starts after the consent is saved, without reloading",
  async () => {
    const { controller, createSocket, pair, consent, nextCall } = await setup();
    start(controller);
    await pair();
    await tick();
    expect(createSocket).not.toHaveBeenCalled();
    const run = nextCall(isRun);
    await consent.save(defaultConsent(profile));
    await run;
    await vi.waitFor(() => {
      expect(createSocket).toHaveBeenCalledTimes(1);
    }, CYCLE);
  },
  SLOW,
);

it("starts after the pair is confirmed when the consent exists", async () => {
  const { controller, createSocket, pair, consent } = await setup();
  await consent.save(defaultConsent(profile));
  start(controller);
  await tick();
  expect(createSocket).not.toHaveBeenCalled();
  await pair();
  await vi.waitFor(() => {
    expect(createSocket).toHaveBeenCalledTimes(1);
  }, CYCLE);
});

it("does not start without a pair, a consent, activity or a mounted screen", async () => {
  const { controller, createSocket, pair, consent, syncs } = await setup();
  controller.setActive(true);
  await tick();
  controller.mount();
  await consent.save(defaultConsent(profile));
  await tick();
  expect(createSocket).not.toHaveBeenCalled();
  await pair();
  controller.setActive(false);
  await tick();
  expect(createSocket).not.toHaveBeenCalled();
  expect(syncs()).toBe(0);
});

it("does not start when the device is not registered", async () => {
  const { controller, createSocket, pair, consent, platform } = await setup();
  await pair();
  await consent.save(defaultConsent(profile));
  await platform.keyStore.delete("identity/signing-private");
  start(controller);
  await tick();
  expect(createSocket).not.toHaveBeenCalled();
});

it("does not start without a socket factory", async () => {
  const { controller, pair, consent, platform, syncs } = await setup();
  delete (platform as { createSocket?: unknown }).createSocket;
  await pair();
  await consent.save(defaultConsent(profile));
  start(controller);
  await tick();
  expect(syncs()).toBe(0);
});

it("stops when the app goes away and resumes with a new transport", async () => {
  const { controller, createSocket, pair, consent } = await setup();
  await pair();
  await consent.save(defaultConsent(profile));
  start(controller);
  await vi.waitFor(() => {
    expect(createSocket).toHaveBeenCalledTimes(1);
  }, CYCLE);
  const first = createSocket.mock.results[0]?.value as { close: () => void };
  controller.setActive(false);
  await vi.waitFor(() => {
    expect(first.close).toHaveBeenCalled();
  }, CYCLE);
  controller.setActive(true);
  await vi.waitFor(() => {
    expect(createSocket).toHaveBeenCalledTimes(2);
  }, CYCLE);
});

it("stops when the screen is locked", async () => {
  const { controller, createSocket, pair, consent } = await setup();
  await pair();
  await consent.save(defaultConsent(profile));
  start(controller);
  await vi.waitFor(() => {
    expect(createSocket).toHaveBeenCalledTimes(1);
  }, CYCLE);
  const first = createSocket.mock.results[0]?.value as { close: () => void };
  controller.unmount();
  await vi.waitFor(() => {
    expect(first.close).toHaveBeenCalled();
  }, CYCLE);
});

it("restarts for a pair with another mailbox", async () => {
  const { controller, createSocket, pair, consent } = await setup();
  await pair();
  await consent.save(defaultConsent(profile));
  start(controller);
  await vi.waitFor(() => {
    expect(createSocket).toHaveBeenCalledTimes(1);
  }, CYCLE);
  await pair("mailbox-2");
  await vi.waitFor(() => {
    expect(createSocket).toHaveBeenCalledTimes(2);
  }, CYCLE);
});

it(
  "requests a synchronization after the profile is saved",
  async () => {
    const set = await setup();
    await set.pair();
    await set.consent.save(defaultConsent(profile));
    const first = set.nextCall(isRun);
    start(set.controller);
    await first;
    await runsAfter(set, () => set.profiles.save(profile));
  },
  SLOW,
);

it(
  "requests a synchronization after a consent changes",
  async () => {
    const set = await setup();
    await set.pair();
    await set.consent.save(defaultConsent(profile));
    const first = set.nextCall(isRun);
    start(set.controller);
    await first;
    await runsAfter(set, () => set.consent.setCategory("CHECKIN", true));
    expect(set.createSocket).toHaveBeenCalledTimes(1);
  },
  SLOW,
);

it("stops when the conditions cannot be read", async () => {
  const { controller, platform, createSocket } = await setup();
  vi.spyOn(platform.database, "get").mockRejectedValue(new Error("db"));
  start(controller);
  await tick();
  expect(createSocket).not.toHaveBeenCalled();
});

it(
  "requests a synchronization after the pause changes",
  async () => {
    const set = await setup();
    await set.pair();
    await set.consent.save(defaultConsent(profile));
    const first = set.nextCall(isRun);
    start(set.controller);
    await first;
    await runsAfter(set, () =>
      createPauseRepository(set.platform.database).setPaused(true),
    );
  },
  SLOW,
);
