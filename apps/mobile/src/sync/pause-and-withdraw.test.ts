import { expect, it } from "vitest";

import { defaultConsent } from "../consent/consent-model";
import { createConsentRepository } from "../consent/consent-repository";
import type { Profile } from "../data/profile";
import { createProfileRepository } from "../data/profile-repository";
import { createHandlerRegistry, type SyncHandler } from "./handler-registry";
import { createPartnerProfileRepository } from "./partner-profile-repository";
import { createPauseRepository } from "./pause-repository";
import { createProfileHandler } from "./profile-handler";
import {
  ChoreHandler,
  createPairedDevices,
  type Device,
} from "./sync-test-support";

const OLA: Partial<Profile> = {
  name: "Ola",
  form: "feminine",
  goals: ["chores", "closeness"],
  cycle: "no",
  shareGoalsWithPartner: true,
};

/** The test handler under its own entity name, as the registry takes one handler per entity. */
function renamed(handler: ChoreHandler, entity: string): SyncHandler {
  return {
    entity,
    category: handler.category,
    collect: async (nextHlc) =>
      (await handler.collect(nextHlc)).map((c) => ({ ...c, entity })),
    committed: () => handler.committed(),
    apply: (change) => handler.apply({ ...change, entity: "Chore" }),
  };
}

/** A device with the profile, a CHECKIN and a SHARED_CHORES handler, the consent and the pause. */
async function withHandlers(device: Device) {
  const { database } = device;
  const profiles = createProfileRepository(database);
  const consent = createConsentRepository({
    database,
    clock: { nowMs: () => 1 },
    profiles,
  });
  const partner = createPartnerProfileRepository(database);
  const pause = createPauseRepository(database);
  const checkin = new ChoreHandler("CHECKIN");
  const chores = new ChoreHandler("SHARED_CHORES");
  const registry = createHandlerRegistry();
  registry.register(
    createProfileHandler({ database, profiles, partner, consent }),
  );
  registry.register(renamed(checkin, "Checkin"));
  registry.register(renamed(chores, "SharedChore"));
  device.restart({
    registry,
    canSync: () => consent.canSync(),
    isShared: (c) => consent.isShared(c),
    isPaused: () => pause.isPaused(),
  });
  await profiles.save(OLA as Profile);
  await consent.save({
    ...defaultConsent({ cycle: "no", shareGoalsWithPartner: true }),
    ONBOARDING_GOALS: true,
    CHECKIN: true,
    SHARED_CHORES: true,
  });
  return { consent, partner, pause, checkin, chores, profiles };
}

async function setup() {
  const devices = await createPairedDevices();
  return {
    ...devices,
    ua: await withHandlers(devices.a),
    ub: await withHandlers(devices.b),
  };
}

it("blocks CHECKIN during the pause but not the profile or SHARED_CHORES", async () => {
  const { a, b, ua, ub } = await setup();
  await ua.pause.setPaused(true);
  ua.checkin.edit("c1", "mood", "good");
  ua.chores.edit("k1", "title", "Dishes");
  await a.engine.sync();
  await b.engine.sync();
  expect(ub.checkin.snapshot()).toEqual({});
  expect(ub.chores.snapshot()).toEqual({ k1: { title: "Dishes" } });
  expect((await ub.partner.get())?.name).toBe("Ola");

  await ua.pause.setPaused(false);
  await a.engine.sync();
  await b.engine.sync();
  expect(ub.checkin.snapshot()).toEqual({ c1: { mood: "good" } });
});

it("withdraws the goals at the partner and sends them again when turned on", async () => {
  const { a, b, ua, ub } = await setup();
  await a.engine.sync();
  await b.engine.sync();
  expect((await ub.partner.get())?.goals).toEqual(["chores", "closeness"]);

  await ua.consent.setCategory("ONBOARDING_GOALS", false);
  await a.engine.sync();
  await b.engine.sync();
  expect((await ub.partner.get())?.goals).toBeNull();

  await ua.consent.setCategory("ONBOARDING_GOALS", true);
  await a.engine.sync();
  await b.engine.sync();
  expect((await ub.partner.get())?.goals).toEqual(["chores", "closeness"]);
});
