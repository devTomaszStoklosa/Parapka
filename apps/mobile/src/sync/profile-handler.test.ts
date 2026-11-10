import { describe, expect, it, vi } from "vitest";

import { defaultConsent } from "../consent/consent-model";
import { createConsentRepository } from "../consent/consent-repository";
import type { JsonValue } from "../data/local-database";
import type { Profile } from "../data/profile";
import { createProfileRepository } from "../data/profile-repository";
import { createHandlerRegistry } from "./handler-registry";
import { createPartnerProfileRepository } from "./partner-profile-repository";
import { createProfileHandler } from "./profile-handler";
import { createPairedDevices, type Device } from "./sync-test-support";

const OLA: Partial<Profile> = {
  name: "Ola",
  form: "feminine",
  goals: ["chores", "closeness"],
  cycle: "no",
  shareGoalsWithPartner: false,
};
const TOMEK: Partial<Profile> = { ...OLA, name: "Tomek", form: "masculine" };

/** A device with the real profile handler and the real consent repository. */
function withProfile(device: Device) {
  const { database } = device;
  const profiles = createProfileRepository(database);
  const consent = createConsentRepository({
    database,
    clock: { nowMs: () => 1 },
    profiles,
  });
  const partner = createPartnerProfileRepository(database);
  const registry = createHandlerRegistry();
  registry.register(
    createProfileHandler({ database, profiles, partner, consent }),
  );
  const gates = {
    registry,
    canSync: () => consent.canSync(),
    isShared: (c: Parameters<typeof consent.isShared>[0]) =>
      consent.isShared(c),
  };
  device.restart(gates);
  return {
    consent,
    partner,
    gates,
    setOwn: (next: Partial<Profile>) => profiles.save(next as Profile),
    give: (goals: boolean) =>
      consent.save({
        ...defaultConsent({ cycle: "no", shareGoalsWithPartner: goals }),
        ONBOARDING_GOALS: goals,
      }),
  };
}

async function setup() {
  const devices = await createPairedDevices();
  const a = withProfile(devices.a);
  const b = withProfile(devices.b);
  await a.setOwn(OLA);
  await b.setOwn(TOMEK);
  return { ...devices, ua: a, ub: b };
}

describe("profile sync", () => {
  it("sends the name and form always and the goals only when shared", async () => {
    const { a, b, ua, ub } = await setup();
    await ua.give(false);
    await ub.give(false);
    await a.engine.sync();
    await b.engine.sync();
    expect(await ub.partner.get()).toEqual({
      name: "Ola",
      form: "feminine",
      goals: null,
    });
    // The own profile is kept apart from the profile of the partner.
    expect((await createProfileRepository(b.database).get())?.name).toBe(
      "Tomek",
    );

    await ua.consent.setCategory("ONBOARDING_GOALS", true);
    await ub.consent.setCategory("ONBOARDING_GOALS", true);
    await a.engine.sync();
    await b.engine.sync();
    expect((await ub.partner.get())?.goals).toEqual(["chores", "closeness"]);
  });

  it("does not take the goals of the partner while they are not shared", async () => {
    const { a, b, ua, ub } = await setup();
    await ua.give(true);
    await ub.give(false);
    await a.engine.sync();
    await b.engine.sync();
    expect(await ub.partner.get()).toEqual({
      name: "Ola",
      form: "feminine",
      goals: null,
    });
  });

  it("gives the held goals once the category is turned on", async () => {
    const { a, b, ua, ub } = await setup();
    await ua.give(true);
    await ub.give(false);
    await a.engine.sync();
    await b.engine.sync();
    await ub.consent.setCategory("ONBOARDING_GOALS", false);
    await ub.consent.setCategory("ONBOARDING_GOALS", true);
    await vi.waitFor(async () => {
      expect((await ub.partner.get())?.goals).toEqual(["chores", "closeness"]);
    });
    await ub.consent.setCategory("ONBOARDING_GOALS", false);
    await ub.consent.setCategory("ONBOARDING_GOALS", true);
    await a.engine.sync();
    await b.engine.sync();
    expect((await ub.partner.get())?.goals).toEqual(["chores", "closeness"]);
  });

  it("keeps the newest of the held goals", async () => {
    const { a, b, ua, ub } = await setup();
    await ua.give(true);
    await ub.give(false);
    await a.engine.sync();
    await b.engine.sync();
    await ua.setOwn({ ...OLA, goals: ["closeness"] });
    await a.engine.sync();
    await b.engine.sync();
    await ub.consent.setCategory("ONBOARDING_GOALS", true);
    await vi.waitFor(async () => {
      expect((await ub.partner.get())?.goals).toEqual(["closeness"]);
    });
  });

  it("ignores a stale change of the held goals", async () => {
    const { ub } = await setup();
    await ub.give(false);
    const handler = ub.gates.registry.get("Profile");
    const send = (hlc: string, goals: string[]) =>
      handler?.apply({
        entity: "Profile",
        id: "profile",
        op: "upsert",
        fields: {
          name: { value: "Ola", hlc: "000000000000000-00000-aaaa" },
          form: { value: "feminine", hlc: "000000000000000-00000-aaaa" },
          goals: { value: goals, hlc },
        },
      });
    await send("000000000000002-00000-aaaa", ["closeness"]);
    await send("000000000000001-00000-aaaa", ["chores"]);
    await ub.consent.setCategory("ONBOARDING_GOALS", true);
    await vi.waitFor(async () => {
      expect((await ub.partner.get())?.goals).toEqual(["closeness"]);
    });
  });

  it("queues a change of the own profile", async () => {
    const { a, b, ua, ub } = await setup();
    await ua.give(false);
    await ub.give(false);
    await a.engine.push();
    await a.engine.push();
    expect(await a.engine.pending()).toBe(0);
    await ua.setOwn({ ...OLA, name: "Aleksandra" });
    await a.engine.push();
    await b.engine.pull();
    expect((await ub.partner.get())?.name).toBe("Aleksandra");
  });

  it("sends and takes nothing without a saved consent", async () => {
    const { a, b, ua, ub } = await setup();
    await a.engine.sync();
    expect((await b.transport.fetch(null)).envelopes).toHaveLength(0);
    await ua.give(false);
    await a.engine.sync();
    await b.engine.pull();
    expect(await ub.partner.get()).toBeNull();
    expect((await b.transport.fetch(null)).envelopes).toHaveLength(1);
    await ub.give(false);
    await b.engine.pull();
    expect((await ub.partner.get())?.name).toBe("Ola");
  });

  it("delivers a change after a failed push", async () => {
    const { a, b, ua, ub } = await setup();
    await ua.give(false);
    await ub.give(false);
    a.restart({
      ...ua.gates,
      transport: {
        ...a.transport,
        send: () => Promise.reject(new Error("offline")),
      },
    });
    await expect(a.engine.push()).rejects.toThrow("offline");
    await ua.setOwn({ ...OLA, name: "Ola K" });
    await a.restart(ua.gates).push();
    await b.engine.pull();
    expect((await ub.partner.get())?.name).toBe("Ola K");
  });

  it("does not lose a change when saving the envelope is interrupted", async () => {
    const { a, b, ua, ub } = await setup();
    await ua.give(false);
    await ub.give(false);
    const put = a.database.put.bind(a.database);
    let failing = true;
    Object.assign(a.database, {
      put: (collection: string, id: string, value: JsonValue) =>
        failing && collection === "sync-outbox"
          ? Promise.reject(new Error("disk"))
          : put(collection, id, value),
    });
    await expect(a.engine.push()).rejects.toThrow("disk");
    failing = false;
    await a.restart(ua.gates).push();
    await b.engine.pull();
    expect((await ub.partner.get())?.name).toBe("Ola");
  });

  it("collects nothing before onboarding and ignores a delete", async () => {
    const devices = await createPairedDevices();
    const a = withProfile(devices.a);
    const b = withProfile(devices.b);
    await a.give(false);
    await b.give(false);
    await devices.a.engine.push();
    expect(await devices.a.engine.pending()).toBe(0);
    const [handler] = b.gates.registry.all();
    await handler?.apply({
      entity: "Profile",
      id: "profile",
      op: "delete",
      hlc: "h",
    });
    expect(await b.partner.get()).toBeNull();
  });
});
