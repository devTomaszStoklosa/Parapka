import { expect, it } from "vitest";

import { defaultConsent } from "../consent/consent-model";
import { createConsentRepository } from "../consent/consent-repository";
import { UNKNOWN_CYCLE_SETTINGS } from "../data/cycle-settings";
import type { LocalDatabase } from "../data/local-database";
import { createMemoryDatabase } from "../data/memory-database";
import type { Profile } from "../data/profile";
import { createProfileRepository } from "../data/profile-repository";
import { createCyclePanel } from "./cycle-panel";

const PROFILE: Profile = {
  name: "Ola",
  form: "feminine",
  adultConfirmed: true,
  relationshipTenure: "1-3",
  hasChildren: false,
  childrenCount: 0,
  goals: [],
  otherGoalText: null,
  shareGoalsWithPartner: false,
  cycle: "yes",
  pinDecision: "skipped",
};

/** The panel over a database with a profile and, with `shared`, a consent. */
async function setup(
  options: { shared?: boolean; database?: LocalDatabase } = {},
) {
  const database = options.database ?? createMemoryDatabase();
  const profiles = createProfileRepository(database);
  const consent = createConsentRepository({
    database,
    clock: { nowMs: () => 1_000 },
    profiles,
  });
  await profiles.save(PROFILE);
  if (options.shared !== undefined) {
    await consent.save({
      ...defaultConsent(PROFILE),
      CYCLE_HINTS: options.shared,
    });
  }
  const panel = createCyclePanel({ database, profiles, consent });
  return { database, profiles, consent, panel };
}

/** One record of each kind of the cycle data, and one hint of the partner with a reaction. */
async function fill(database: LocalDatabase) {
  await database.put("cycle-settings", "me", { unknown: true });
  await database.put("period-logs", "p1", { id: "p1" });
  await database.put("wellbeing-entries", "2026-11-02", { date: "x" });
  await database.put("cycle-hints", "h1", { text: "Moja wskazówka" });
  await database.put("cycle-hints-received", "r1", { text: "Od partnera" });
  await database.put("hint-reactions", "r1", { reaction: "done" });
  await database.put("hint-feedback", "since", { date: "2026-10-28" });
  await database.put("hint-feedback", "entry-2026-11-11", { closed: true });
}

const idsOf = async (database: LocalDatabase, collection: string) =>
  (await database.list(collection)).map(({ id }) => id);

it("removes the own cycle data and keeps what the partner sent", async () => {
  const { database, panel, profiles } = await setup();
  await fill(database);
  await panel.disable();
  expect(await idsOf(database, "cycle-settings")).toEqual([]);
  expect(await idsOf(database, "period-logs")).toEqual([]);
  expect(await idsOf(database, "wellbeing-entries")).toEqual([]);
  expect(await idsOf(database, "cycle-hints")).toEqual([]);
  expect(await idsOf(database, "hint-feedback")).toEqual([]);
  expect(await idsOf(database, "cycle-hints-received")).toEqual(["r1"]);
  expect(await idsOf(database, "hint-reactions")).toEqual(["r1"]);
  expect((await profiles.get())?.cycle).toBe("no");
});

it("keeps the withdrawal marker of the hints", async () => {
  const { database, panel } = await setup();
  await database.put("hint-withdrawal", "state", "shared");
  await panel.disable();
  expect(await database.get("hint-withdrawal", "state")).toBe("shared");
});

it("turns CYCLE_HINTS off in the consent, so turning the panel on does not resume sharing", async () => {
  const { panel, consent } = await setup({ shared: true });
  await panel.disable();
  expect((await consent.current())?.states.CYCLE_HINTS).toBe(false);
  await panel.enable(UNKNOWN_CYCLE_SETTINGS);
  expect(await consent.isShared("CYCLE_HINTS")).toBe(false);
});

it("leaves the consent alone when enabling", async () => {
  const { panel, consent, profiles } = await setup({ shared: false });
  await panel.disable();
  await panel.enable(UNKNOWN_CYCLE_SETTINGS);
  expect((await profiles.get())?.cycle).toBe("yes");
  expect((await consent.current())?.states.CYCLE_HINTS).toBe(false);
});

it("keeps the panel on after a failure and finishes the cleanup on a new try", async () => {
  const database = createMemoryDatabase();
  const { panel, profiles } = await setup({ database });
  await fill(database);
  const failing: LocalDatabase = {
    ...database,
    delete: (collection, id) =>
      collection === "wellbeing-entries"
        ? Promise.reject(new Error("disk"))
        : database.delete(collection, id),
  };
  await expect(
    (await setup({ database: failing })).panel.disable(),
  ).rejects.toThrow("disk");
  expect((await profiles.get())?.cycle).toBe("yes");
  expect(await idsOf(database, "wellbeing-entries")).toEqual(["2026-11-02"]);

  await panel.disable();
  expect((await profiles.get())?.cycle).toBe("no");
  expect(await idsOf(database, "wellbeing-entries")).toEqual([]);
});

it("starts from empty data when the panel is turned on again", async () => {
  const { database, panel } = await setup();
  await fill(database);
  await panel.disable();
  const settings = { ...UNKNOWN_CYCLE_SETTINGS, wellbeingReminder: true };
  await panel.enable(settings);
  expect(await database.get("cycle-settings", "me")).toEqual(settings);
  expect(await idsOf(database, "period-logs")).toEqual([]);
  expect(await idsOf(database, "wellbeing-entries")).toEqual([]);
  expect(await idsOf(database, "cycle-hints")).toEqual([]);
});

it("does not enable the panel without a profile", async () => {
  const { database, panel } = await setup();
  await database.delete("profile", "me");
  await expect(panel.enable(UNKNOWN_CYCLE_SETTINGS)).rejects.toThrow(
    "There is no profile",
  );
});
