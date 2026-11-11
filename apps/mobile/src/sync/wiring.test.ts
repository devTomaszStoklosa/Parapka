import type { Sodium } from "@parapka/crypto";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

import { defaultConsent } from "../consent/consent-model";
import { wireConsent } from "../consent/wiring";
import { createMemoryDatabase } from "../data/memory-database";
import type { Profile } from "../data/profile";
import { createIdentity } from "../identity/identity";
import { createPairRepository } from "../pairing/pair-repository";
import type { Platform } from "../platform/context";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { webSha256 } from "../platform/sha256";
import { createWebSodium } from "../platform/web-sodium";
import { createPauseRepository } from "./pause-repository";
import { PAIR_GONE_MESSAGE, wireSync, type SyncController } from "./wiring";

let sodium: Sodium;

beforeAll(async () => {
  sodium = await createWebSodium();
});

const stoppers: (() => void)[] = [];

afterEach(() => {
  for (const stop of stoppers.splice(0)) stop();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const profile: Profile = {
  name: "Ola",
  form: "feminine",
  adultConfirmed: true,
  relationshipTenure: "1-3",
  hasChildren: false,
  childrenCount: 0,
  goals: [],
  otherGoalText: null,
  shareGoalsWithPartner: false,
  cycle: "no",
  pinDecision: "skipped",
};

const keys = {
  sendKey: new Uint8Array(32).fill(1),
  receiveKey: new Uint8Array(32).fill(2),
};

function socket() {
  return {
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    close: vi.fn(),
  };
}

/** A registered device on a platform whose relay answers `status` to every call but challenges. */
async function setup(status = 200) {
  const database = createMemoryDatabase();
  const keyStore = createMemoryKeyStore();
  await createIdentity({
    sodium,
    keyStore,
    database,
    relay: () => ({
      registerDevice: () => Promise.resolve({ deviceId: "me" }),
    }),
  }).init();
  const calls: string[] = [];
  vi.stubGlobal("fetch", (url: string, init: { method: string }) => {
    calls.push(`${init.method} ${url}`);
    const challenge = url.endsWith("/challenges");
    return Promise.resolve({
      status: challenge ? 201 : status,
      text: () =>
        Promise.resolve(
          challenge
            ? JSON.stringify({ challengeId: "c", nonce: "n" })
            : JSON.stringify({ envelopes: [], nextCursor: null }),
        ),
    });
  });
  const createSocket = vi.fn(socket);
  const platform = {
    sodium,
    keyStore,
    clock: { nowMs: () => 1_000 },
    database,
    sha256: webSha256,
    relayUrl: "unused-relay",
    appUrl: "unused",
    createSocket,
  } as unknown as Platform;
  const pairs = createPairRepository(database, keyStore);
  const { consent, profiles } = wireConsent(platform);
  const controller = wireSync(platform);
  stoppers.push(() => {
    controller.unmount();
  });
  const pair = (mailbox = "mailbox-1") =>
    pairs
      .savePending(
        {
          pairMailboxId: mailbox,
          deviceId: "partner",
          signingPublicKey: "s",
          agreementPublicKey: "a",
        },
        keys,
      )
      .then(() => pairs.confirm());
  const syncs = () => calls.filter((c) => c.includes("/envelopes")).length;
  return {
    platform,
    controller,
    createSocket,
    pairs,
    consent,
    profiles,
    pair,
    syncs,
  };
}

function start(controller: SyncController) {
  controller.setActive(true);
  controller.mount();
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

it("gives one controller for one platform", async () => {
  const { platform, controller } = await setup();
  expect(wireSync(platform)).toBe(controller);
});

it("starts after the consent is saved, without reloading", async () => {
  const { controller, createSocket, pair, consent, syncs } = await setup();
  start(controller);
  await pair();
  await tick();
  expect(createSocket).not.toHaveBeenCalled();
  await consent.save(defaultConsent(profile));
  await vi.waitFor(() => {
    expect(createSocket).toHaveBeenCalledTimes(1);
  });
  expect(syncs()).toBeGreaterThan(0);
});

it("starts after the pair is confirmed when the consent exists", async () => {
  const { controller, createSocket, pair, consent } = await setup();
  await consent.save(defaultConsent(profile));
  start(controller);
  await tick();
  expect(createSocket).not.toHaveBeenCalled();
  await pair();
  await vi.waitFor(() => {
    expect(createSocket).toHaveBeenCalledTimes(1);
  });
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
  });
  const first = createSocket.mock.results[0]?.value as { close: () => void };
  controller.setActive(false);
  await vi.waitFor(() => {
    expect(first.close).toHaveBeenCalled();
  });
  controller.setActive(true);
  await vi.waitFor(() => {
    expect(createSocket).toHaveBeenCalledTimes(2);
  });
});

it("stops when the screen is locked", async () => {
  const { controller, createSocket, pair, consent } = await setup();
  await pair();
  await consent.save(defaultConsent(profile));
  start(controller);
  await vi.waitFor(() => {
    expect(createSocket).toHaveBeenCalledTimes(1);
  });
  const first = createSocket.mock.results[0]?.value as { close: () => void };
  controller.unmount();
  await vi.waitFor(() => {
    expect(first.close).toHaveBeenCalled();
  });
});

it("restarts for a pair with another mailbox", async () => {
  const { controller, createSocket, pair, consent } = await setup();
  await pair();
  await consent.save(defaultConsent(profile));
  start(controller);
  await vi.waitFor(() => {
    expect(createSocket).toHaveBeenCalledTimes(1);
  });
  await pair("mailbox-2");
  await vi.waitFor(() => {
    expect(createSocket).toHaveBeenCalledTimes(2);
  });
});

it("requests a synchronization after the profile is saved", async () => {
  const { controller, createSocket, pair, consent, profiles, syncs } =
    await setup();
  await pair();
  await consent.save(defaultConsent(profile));
  start(controller);
  await vi.waitFor(() => {
    expect(createSocket).toHaveBeenCalledTimes(1);
  });
  await vi.waitFor(() => {
    expect(syncs()).toBeGreaterThan(0);
  });
  await tick();
  const before = syncs();
  await profiles.save(profile);
  await vi.waitFor(
    () => {
      expect(syncs()).toBeGreaterThan(before);
    },
    { timeout: 3000 },
  );
});

it("requests a synchronization after a consent changes", async () => {
  const { controller, createSocket, pair, consent, syncs } = await setup();
  await pair();
  await consent.save(defaultConsent(profile));
  start(controller);
  await vi.waitFor(() => {
    expect(createSocket).toHaveBeenCalledTimes(1);
  });
  await tick();
  const before = syncs();
  await consent.setCategory("CHECKIN", true);
  await vi.waitFor(() => {
    expect(syncs()).toBeGreaterThan(before);
  });
  expect(createSocket).toHaveBeenCalledTimes(1);
});

it("stops on pair-gone and logs a fixed message", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const { controller, createSocket, pair, consent } = await setup(410);
  await pair();
  await consent.save(defaultConsent(profile));
  start(controller);
  await vi.waitFor(() => {
    expect(warn).toHaveBeenCalledWith(PAIR_GONE_MESSAGE);
  });
  const first = createSocket.mock.results[0]?.value as { close: () => void };
  expect(first.close).toHaveBeenCalled();
});

it("stops when the conditions cannot be read", async () => {
  const { controller, platform, createSocket } = await setup();
  vi.spyOn(platform.database, "get").mockRejectedValue(new Error("db"));
  start(controller);
  await tick();
  expect(createSocket).not.toHaveBeenCalled();
});

it("requests a synchronization after the pause changes", async () => {
  const { controller, pair, consent, platform, syncs } = await setup();
  await pair();
  await consent.save(defaultConsent(profile));
  start(controller);
  await vi.waitFor(() => {
    expect(syncs()).toBeGreaterThan(0);
  });
  await tick();
  const before = syncs();
  await createPauseRepository(platform.database).setPaused(true);
  await vi.waitFor(() => {
    expect(syncs()).toBeGreaterThan(before);
  });
});
