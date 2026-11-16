import { createHlc, formatHlc } from "@parapka/sync";
import { expect, it, vi } from "vitest";

import { REVEALED_COLLECTION } from "../checkin/reveal";
import { createSingleDevice, ME, PARTNER } from "../chores/chore-test-support";
import { defaultConsent, NO_PROFILE } from "../consent/consent-model";
import { createConsentRepository } from "../consent/consent-repository";
import { changeChannel } from "../data/change-listeners";
import { createProfileRepository } from "../data/profile-repository";
import { createDisconnectRepository } from "../pairing/disconnect-repository";
import type { Platform } from "../platform/context";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { createWebSodium } from "../platform/web-sodium";
import { createPartnerProfileRepository } from "../sync/partner-profile-repository";
import { createPauseRepository } from "../sync/pause-repository";
import { listQueued, messageFor } from "./delivery";
import type { PlannedNotification } from "./planned";
import { createEventWatch, wireEventWatch } from "./event-watch";
import { createNotificationSettingsRepository } from "./notification-settings";

type Entry = {
  requestId: string;
  itemId: string;
  requestedBy: string;
  status: string;
};

/** One device with the real local repositories; the handovers are a list. */
async function setup(mode?: "paired" | "busy") {
  const device = createSingleDevice();
  const { database } = device;
  let now = 1_800_000_000_000;
  const clock = { nowMs: () => (now += 1) };
  const entries: Entry[] = [];
  const listeners = new Set<() => void>();
  const handovers = {
    list: () => Promise.resolve([...entries]),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const consent = createConsentRepository({
    database,
    clock,
    profiles: createProfileRepository(database),
  });
  await consent.save(defaultConsent(NO_PROFILE));
  const disconnect = createDisconnectRepository(database);
  const partner = createPartnerProfileRepository(database);
  const settings = createNotificationSettingsRepository(database);
  const watch = createEventWatch({
    database,
    clock,
    deviceId: () => Promise.resolve("me"),
    handovers,
    items: {
      list: () => Promise.resolve([{ id: "i1", title: "Szczepienie" }]),
    },
    reveal: {
      subscribe: changeChannel(database, REVEALED_COLLECTION).subscribe,
    },
    pairs: device.pairs,
    disconnect,
    partner,
    isShared: (category) => consent.isShared(category),
    settings,
  });
  const keys = { sendKey: new Uint8Array(32), receiveKey: new Uint8Array(32) };
  const at = formatHlc(createHlc(1_800_000_000_000, 0, "device-b"));
  const world = {
    ...device,
    watch,
    consent,
    disconnect,
    settings,
    entries,
    notify: () => {
      for (const listener of listeners) listener();
    },
    /** The partner answers a request of this person. */
    answer: (status: string, requestedBy = "me") => {
      entries.push({ requestId: "r1", itemId: "i1", requestedBy, status });
    },
    reveal: async (week = "2026-W46") => {
      await database.put(REVEALED_COLLECTION, week, { week });
    },
    connect: async () => {
      await device.pairs.savePending(
        {
          pairMailboxId: "m",
          deviceId: "partner",
          signingPublicKey: "s",
          agreementPublicKey: "a",
        },
        keys,
      );
      await device.pairs.confirm();
    },
    introduce: (form: "feminine" | "masculine" | "neutral") =>
      partner.merge({
        name: { value: "Maja", hlc: at },
        form: { value: form, hlc: at },
      }),
    queued: async () =>
      (await listQueued(database))
        .sort((a, b) => a.atMs - b.atMs)
        .map(({ id }) => id),
  };
  if (mode) {
    await world.connect();
    await consent.setCategory("CHECKIN", true);
    await consent.setCategory("SHARED_MENTAL_LOAD", true);
  }
  if (mode === "busy") {
    world.answer("accepted");
    await world.reveal();
  }
  // The first look: it only remembers what is here now.
  await watch.scan();
  return world;
}

type World = Awaited<ReturnType<typeof setup>>;

const paired = () => setup("paired");

it("only remembers at the first look", async () => {
  const device = await setup("busy");
  expect(await device.queued()).toEqual([]);
  await device.watch.scan();
  expect(await device.queued()).toEqual([]);
});

it.each([
  ["feminine", "Maja przejęła: Szczepienie"],
  ["masculine", "Maja przejął: Szczepienie"],
  ["neutral", "Maja przejmuje: Szczepienie"],
] as const)(
  "words the handover by the form %s of the partner",
  async (form, title) => {
    const device = await paired();
    await device.introduce(form);
    device.answer("accepted");
    await device.watch.scan();
    const [item] = (await listQueued(device.database)) as [PlannedNotification];
    expect(messageFor([item], false)).toMatchObject({ title });
    // The discreet mode has one text, without the name and the title.
    const discreet = messageFor([item], true);
    expect(`${discreet.title} ${discreet.body}`).not.toMatch(
      /Maja|Szczepienie/,
    );
  },
);

it("words the handover without a name before the profile arrives", async () => {
  const device = await paired();
  device.answer("accepted");
  await device.watch.scan();
  const [item] = (await listQueued(device.database)) as [PlannedNotification];
  expect(messageFor([item], false).title).toBe(
    "Rzecz została przejęta: Szczepienie",
  );
  // The queue keeps the keys and the name and the title only.
  expect(JSON.stringify(item)).not.toMatch(/cycle|mood|energy/);
});

it("gives nothing when the partner declines, or for a request of the partner", async () => {
  const device = await paired();
  device.answer("declined");
  device.answer("accepted", "partner");
  await device.watch.scan();
  expect(await device.queued()).toEqual([]);
});

it.each([
  [true, ["handover-taken:r1"]],
  [false, []],
] as const)(
  "queues the handover with the consent of SHARED_MENTAL_LOAD %s",
  async (shared, expected) => {
    const device = await paired();
    await device.consent.setCategory("SHARED_MENTAL_LOAD", shared);
    device.answer("accepted");
    await device.watch.scan();
    expect(await device.queued()).toEqual(expected);
  },
);

it.each([
  [true, ["checkin-results:2026-W46"]],
  [false, []],
] as const)(
  "queues the results of the check-in with the consent of CHECKIN %s",
  async (shared, expected) => {
    const device = await paired();
    await device.consent.setCategory("CHECKIN", shared);
    await device.reveal();
    await device.watch.scan();
    expect(await device.queued()).toEqual(expected);
  },
);

it("queues no results of the check-in without a pair", async () => {
  const device = await setup();
  await device.consent.setCategory("CHECKIN", true);
  await device.reveal();
  await device.watch.scan();
  expect(await device.queued()).toEqual([]);
});

it.each([
  [
    "handover-taken",
    (device: World) => {
      device.answer("accepted");
      return Promise.resolve();
    },
  ],
  ["checkin-results", async (device: World) => device.reveal()],
] as const)(
  "forgets the event of the turned off type %s for good",
  async (type, happen) => {
    const device = await paired();
    await device.settings.set({ enabled: { [type]: false } });
    await happen(device);
    await device.watch.scan();
    await device.settings.set({ enabled: { [type]: true } });
    await device.watch.scan();
    expect(await device.queued()).toEqual([]);
  },
);

it("notices the connection, the end by the partner and a new connection", async () => {
  const device = await setup();
  await device.connect();
  await device.watch.scan();
  await device.pairs.remove();
  await device.disconnect.markByPartner();
  await device.watch.scan();
  await device.disconnect.acknowledge();
  await device.connect();
  await device.watch.scan();
  const queued = await device.queued();
  expect(queued.map((id) => id.split(":")[1])).toEqual([
    "connected",
    "disconnected",
    "connected",
  ]);
});

it("gives nothing for the pause, the consents, the giving away and the arrears (FR-NOT-06)", async () => {
  const device = await paired();
  await createPauseRepository(device.database).setPaused(true);
  await device.consent.setCategory("CHECKIN", false);
  await device.consent.setCategory("SHARED_MENTAL_LOAD", false);
  device.answer("declined");
  const { id } = await device.chores.add({
    title: "Zmywanie",
    rule: { kind: "weekdays", weekdays: [1] },
    assignment: PARTNER,
  });
  await device.chores.release(id);
  await device.chores.add({
    title: "Pranie",
    rule: { kind: "weekdays", weekdays: [1] },
    assignment: ME,
  });
  await device.watch.scan();
  expect(await device.queued()).toEqual([]);
});

it("sends nothing: the state and the queue never reach the outbox", async () => {
  const device = await paired();
  device.answer("accepted");
  await device.reveal();
  await device.watch.scan();
  expect(await device.queued()).toHaveLength(2);
  expect(await device.database.list("notification-watch")).toHaveLength(1);
  expect(await device.database.list("sync-outbox")).toEqual([]);
});

it("looks after a change of a source until it is stopped, and survives a failed look", async () => {
  const device = await paired();
  const stop = device.watch.start();
  const get = vi.spyOn(device.database, "get");
  get.mockRejectedValueOnce(new Error("broken"));
  device.notify();
  device.answer("accepted");
  device.notify();
  await vi.waitFor(async () => {
    expect(await device.queued()).toEqual(["handover-taken:r1"]);
  });
  await device.watch.scan();
  stop();
  get.mockClear();
  device.notify();
  expect(get).not.toHaveBeenCalled();
});

it("is wired on the repositories of the platform, one observer per platform", async () => {
  const { database } = createSingleDevice();
  const platform = {
    database,
    clock: { nowMs: () => 1_800_000_000_000 },
    sodium: await createWebSodium(),
    keyStore: createMemoryKeyStore(),
    sha256: (data: Uint8Array) => data,
    relayUrl: "http://relay",
    appUrl: "http://app",
  } as unknown as Platform;
  const watch = wireEventWatch(platform);
  expect(wireEventWatch(platform)).toBe(watch);
  const stop = watch.start();
  await watch.scan();
  stop();
  expect(await database.list("notification-watch")).toHaveLength(1);
  expect(await listQueued(database)).toEqual([]);
});
