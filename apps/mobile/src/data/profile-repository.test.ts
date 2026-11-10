// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Sodium } from "@parapka/crypto";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { createWebSodium } from "../platform/web-sodium";
import { createIndexedDbDatabase } from "./indexeddb-database";
import type { LocalDatabase } from "./local-database";
import { createMemoryDatabase } from "./memory-database";
import type { Profile } from "./profile";
import { createProfileRepository } from "./profile-repository";

let sodium: Sodium;

beforeAll(async () => {
  sodium = await createWebSodium();
});

const profile: Profile = {
  name: "Ola",
  form: "feminine",
  adultConfirmed: true,
  relationshipTenure: "3-7",
  hasChildren: true,
  childrenCount: 2,
  goals: ["time-together", "other"],
  otherGoalText: "Wspólna podróż",
  shareGoalsWithPartner: false,
  cycle: "yes",
  pinDecision: "skipped",
};

function suite(name: string, create: () => Promise<LocalDatabase>): void {
  describe(`ProfileRepository on ${name}`, () => {
    it("reads null before anything is saved", async () => {
      const repo = createProfileRepository(await create());
      expect(await repo.get()).toBeNull();
    });

    it("reads the saved profile", async () => {
      const repo = createProfileRepository(await create());
      await repo.save(profile);
      expect(await repo.get()).toEqual(profile);
    });

    it("overwrites the saved profile", async () => {
      const repo = createProfileRepository(await create());
      await repo.save(profile);
      await repo.save({ ...profile, name: "Ala", goals: [] });
      expect(await repo.get()).toEqual({ ...profile, name: "Ala", goals: [] });
    });
  });
}

describe("ProfileRepository.subscribe", () => {
  it("notifies after a save, also from another instance on the same database", async () => {
    const db = createMemoryDatabase();
    const listener = vi.fn();
    const unsubscribe = createProfileRepository(db).subscribe(listener);
    await createProfileRepository(db).save(profile);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    await createProfileRepository(db).save(profile);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

suite("memory", () => Promise.resolve(createMemoryDatabase()));
suite("IndexedDB", async () => {
  const db = createIndexedDbDatabase({
    sodium,
    keyStore: createMemoryKeyStore(),
  });
  await db.clear();
  return db;
});
