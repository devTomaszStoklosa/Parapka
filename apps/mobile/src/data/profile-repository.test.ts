// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
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
  relationshipMonths: 30,
  hasChildren: true,
  goals: [
    { text: "Więcej czasu razem", shareWithPartner: true },
    { text: "Prywatny cel", shareWithPartner: false },
  ],
  hasCycle: true,
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

suite("memory", () => Promise.resolve(createMemoryDatabase()));
suite("IndexedDB", async () => {
  const db = createIndexedDbDatabase({
    sodium,
    keyStore: createMemoryKeyStore(),
  });
  await db.clear();
  return db;
});
