// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { createWebSodium } from "../platform/web-sodium";
import { createIndexedDbDatabase } from "./indexeddb-database";
import type { LocalDatabase } from "./local-database";
import { createMemoryDatabase } from "./memory-database";
import type { Profile } from "./profile";
import { createProfileRepository } from "./profile-repository";

const profile: Profile = {
  name: "Ala",
  grammaticalForm: "feminine",
  adultConfirmed: true,
  relationshipDuration: "3to7",
  children: { has: true, count: 2 },
  goals: [{ kind: "closeness" }, { kind: "other", text: "podróże" }],
  showGoalsToPartner: false,
  cycle: "notNow",
};

const databases: [string, () => Promise<LocalDatabase>][] = [
  ["memory", () => Promise.resolve(createMemoryDatabase())],
  [
    "IndexedDB",
    async () => {
      const db = createIndexedDbDatabase({
        sodium: await createWebSodium(),
        keyStore: createMemoryKeyStore(),
      });
      await db.clear();
      return db;
    },
  ],
];

describe.each(databases)("ProfileRepository on %s", (_name, create) => {
  it("returns null before anything is saved", async () => {
    const repo = createProfileRepository(await create());
    expect(await repo.get()).toBeNull();
  });

  it("returns the saved profile", async () => {
    const repo = createProfileRepository(await create());
    await repo.save(profile);
    expect(await repo.get()).toEqual(profile);
  });

  it("overwrites the profile", async () => {
    const repo = createProfileRepository(await create());
    await repo.save(profile);
    await repo.save({ ...profile, name: "Basia", showGoalsToPartner: true });
    expect(await repo.get()).toEqual({
      ...profile,
      name: "Basia",
      showGoalsToPartner: true,
    });
  });
});
