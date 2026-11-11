import type { ContentChange } from "@parapka/protocol";
import { expect, it, vi } from "vitest";

import { defaultConsent } from "../consent/consent-model";
import { createConsentRepository } from "../consent/consent-repository";
import { createProfileRepository } from "../data/profile-repository";
import { clearPairLocally } from "../pairing/clear-pair";
import { createDisconnectRepository } from "../pairing/disconnect-repository";
import { createHandlerRegistry, type NextHlc } from "./handler-registry";
import { createPairHandler } from "./pair-handler";
import { createPartnerProfileRepository } from "./partner-profile-repository";
import { createProfileHandler } from "./profile-handler";
import { createPairedDevices, type Device } from "./sync-test-support";

const STAMP = "000000000000001-00000-device-a";
const command = (value: string): ContentChange => ({
  entity: "Pair",
  id: "pair",
  op: "upsert",
  fields: { command: { value, hlc: STAMP } },
});

/** A device with the profile handler, the Pair handler and the real cleanup. */
function wire(device: Device) {
  const { database } = device;
  const profiles = createProfileRepository(database);
  const consent = createConsentRepository({
    database,
    clock: { nowMs: () => 1 },
    profiles,
  });
  const partner = createPartnerProfileRepository(database);
  const disconnect = createDisconnectRepository(database);
  const registry = createHandlerRegistry();
  registry.register(
    createProfileHandler({ database, profiles, partner, consent }),
  );
  const onDisconnect = vi.fn(async () => {
    await clearPairLocally({
      database,
      registry,
      pairs: device.pairs,
      consent,
    });
    await disconnect.markByPartner();
  });
  registry.register(createPairHandler({ onDisconnect }));
  device.restart({
    registry,
    canSync: () => consent.canSync(),
    isShared: (c) => consent.isShared(c),
  });
  return { profiles, consent, partner, disconnect, onDisconnect, registry };
}

async function setup() {
  const devices = await createPairedDevices();
  const a = wire(devices.a);
  const b = wire(devices.b);
  const consent = defaultConsent({ cycle: "no", shareGoalsWithPartner: false });
  const profile = { name: "Ola", form: "feminine", goals: [], cycle: "no" };
  await a.profiles.save(profile as never);
  await b.profiles.save({ ...profile, name: "Tomek" } as never);
  await a.consent.save(consent);
  await b.consent.save(consent);
  return { ...devices, ua: a, ub: b };
}

/** A sends the command in its own envelope, as the handler of the sender will. */
async function sendCommand(a: Device, value = "disconnect") {
  const registry = createHandlerRegistry();
  const sender = {
    entity: "Pair",
    category: null,
    apply: () => Promise.resolve(),
    collect: (nextHlc: NextHlc) =>
      Promise.resolve([
        {
          ...command(value),
          fields: { command: { value, hlc: nextHlc() } },
        } as ContentChange,
      ]),
  };
  registry.register(sender);
  a.restart({ registry });
  await a.engine.push();
}

it("takes the profile of A, then loses it with the keys and the consent on the command", async () => {
  const { a, b, ub } = await setup();
  await a.engine.sync();
  await b.engine.sync();
  expect((await ub.partner.get())?.name).toBe("Ola");

  await sendCommand(a);
  await b.engine.pull();

  expect(ub.onDisconnect).toHaveBeenCalledTimes(1);
  expect(await ub.partner.get()).toBeNull();
  expect(await b.pairs.current()).toBeNull();
  expect(await b.pairs.keys()).toBeNull();
  expect(await ub.consent.current()).toBeNull();
  expect(await ub.disconnect.state()).toBe("by-partner");
  expect(await b.database.list("sync-applied")).toEqual([]);
  expect(await b.database.get("sync-state", "cursor")).toBeNull();
  // Own profile stays.
  expect((await ub.profiles.get())?.name).toBe("Tomek");
});

it("ignores a command it does not know and a deletion", async () => {
  const { a, b, ub } = await setup();
  await sendCommand(a, "dance");
  await b.engine.pull();
  const handler = ub.registry.get("Pair");
  await handler?.apply({
    entity: "Pair",
    id: "pair",
    op: "delete",
    hlc: STAMP,
  });
  expect(ub.onDisconnect).not.toHaveBeenCalled();
  expect(await b.pairs.current()).not.toBeNull();
});

it("has nothing to send", async () => {
  const { ub } = await setup();
  expect(await ub.registry.get("Pair")?.collect(() => STAMP)).toEqual([]);
});
