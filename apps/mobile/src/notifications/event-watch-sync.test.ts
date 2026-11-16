import { createHlc, formatHlc } from "@parapka/sync";
import { expect, it } from "vitest";

import { setupCheckinPair } from "../checkin/checkin-test-support";
import { REVEALED_COLLECTION } from "../checkin/reveal";
import { changeChannel } from "../data/change-listeners";
import { exchange, setupHeadPair } from "../head/carrier-test-support";
import { createDisconnectRepository } from "../pairing/disconnect-repository";
import { createPartnerProfileRepository } from "../sync/partner-profile-repository";
import { createPairedDevices, type Device } from "../sync/sync-test-support";
import { listQueued, messageFor } from "./delivery";
import { createEventWatch, type EventWatchDeps } from "./event-watch";
import { createNotificationSettingsRepository } from "./notification-settings";

const AT = formatHlc(createHlc(1_800_000_000_000, 0, "device-b"));
const idle = () => () => undefined;

/** The observer of a device, after its first look; `parts` replace the idle sources. */
async function watchOf(
  device: Device,
  parts: Partial<EventWatchDeps> = {},
  shared = true,
) {
  const { database } = device;
  const partner = createPartnerProfileRepository(database);
  const disconnect = createDisconnectRepository(database);
  const watch = createEventWatch({
    database,
    clock: { nowMs: () => Date.now() },
    deviceId: () => Promise.resolve(device.id),
    handovers: { list: () => Promise.resolve([]), subscribe: idle },
    items: { list: () => Promise.resolve([]) },
    reveal: {
      subscribe: changeChannel(database, REVEALED_COLLECTION).subscribe,
    },
    pairs: device.pairs,
    disconnect,
    partner,
    isShared: () => Promise.resolve(shared),
    settings: createNotificationSettingsRepository(database),
    ...parts,
  });
  await watch.scan();
  return { watch, disconnect, partner };
}

/** The titles of what waits in the queue of the device, in the full text. */
async function titles(device: Device) {
  const queued = await listQueued(device.database);
  return queued.map((item) => messageFor([item], false).title);
}

/** A asks B to take over a thing; B answers; both devices look. */
async function handover(
  answer: "acceptHandover" | "declineHandover",
  shared = true,
) {
  const pair = await setupHeadPair();
  const parts = (side: "ua" | "ub") => ({
    handovers: pair[side].handovers,
    items: pair[side].items,
  });
  const a = await watchOf(pair.a, parts("ua"), shared);
  const b = await watchOf(pair.b, parts("ub"));
  await a.partner.merge({
    name: { value: "Maja", hlc: AT },
    form: { value: "feminine", hlc: AT },
  });
  const { id } = await pair.ua.head.add({ title: "Szczepienie" });
  await exchange(pair);
  const requestId = await pair.ua.handover.requestHandover(id);
  await exchange(pair);
  await pair.ub.handover[answer](requestId);
  await exchange(pair);
  await exchange(pair);
  await a.watch.scan();
  await b.watch.scan();
  return pair;
}

it("tells the one who asked, in the form of the partner, and not the one who took over", async () => {
  const pair = await handover("acceptHandover");
  expect(await titles(pair.a)).toEqual(["Maja przejęła: Szczepienie"]);
  expect(await titles(pair.b)).toEqual([]);
});

it("tells nothing about a refusal", async () => {
  const pair = await handover("declineHandover");
  expect(await titles(pair.a)).toEqual([]);
  expect(await titles(pair.b)).toEqual([]);
});

it.each([
  [true, 1],
  [false, 0],
])(
  "tells about a taken thing only with the consent of SHARED_MENTAL_LOAD %s",
  async (shared, count) => {
    const pair = await handover("acceptHandover", shared);
    expect(await titles(pair.a)).toHaveLength(count);
  },
);

/** Both fill in the check-in (or only B); the sync runs; both devices look. */
async function checkin(bothFill: boolean, aShared = true) {
  const pair = await setupCheckinPair();
  const parts = (side: "ua" | "ub") => ({ reveal: pair[side].reveal });
  const a = await watchOf(pair.a, parts("ua"), aShared);
  const b = await watchOf(pair.b, parts("ub"));
  if (bothFill)
    await pair.ua.service.submit({ mood: 4, energy: 2, closeness: 5 });
  await pair.ub.service.submit({ mood: 1, energy: 3, closeness: 2 });
  for (let round = 0; round < 3; round += 1) {
    await pair.a.engine.sync();
    await pair.b.engine.sync();
  }
  await a.watch.scan();
  await b.watch.scan();
  return pair;
}

it("tells both once that the results of the check-in are ready", async () => {
  const pair = await checkin(true);
  expect(await titles(pair.a)).toEqual(["Wyniki check-inu są gotowe"]);
  expect(await titles(pair.b)).toEqual(["Wyniki check-inu są gotowe"]);
});

it("tells nothing while the partner has filled in and the results are hidden", async () => {
  const pair = await checkin(false);
  expect(await titles(pair.a)).toEqual([]);
  expect(await titles(pair.b)).toEqual([]);
});

it.each([
  [true, 1],
  [false, 0],
])(
  "tells about the results only with the consent of CHECKIN %s",
  async (shared, count) => {
    const pair = await checkin(true, shared);
    expect(await titles(pair.a)).toHaveLength(count);
  },
);

it("tells the end by the partner, not the own one, and a new connection", async () => {
  const pair = await createPairedDevices();
  const a = await watchOf(pair.a);
  const b = await watchOf(pair.b);
  // B ended the pair: A is cleaned up as after the command of the partner.
  await pair.b.pairs.remove();
  await a.disconnect.markByPartner();
  await pair.a.pairs.remove();
  await a.watch.scan();
  await b.watch.scan();
  expect(await titles(pair.a)).toEqual(["Para została rozłączona"]);
  expect(await titles(pair.b)).toEqual([]);
  await a.disconnect.acknowledge();
  await pair.a.pairs.savePending(
    {
      pairMailboxId: "m2",
      deviceId: "device-b",
      signingPublicKey: "s",
      agreementPublicKey: "a",
    },
    pair.a.keys,
  );
  await pair.a.pairs.confirm();
  await a.watch.scan();
  expect((await titles(pair.a)).sort()).toEqual([
    "Para została połączona",
    "Para została rozłączona",
  ]);
});
