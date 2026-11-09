// @vitest-environment jsdom
import type { Sodium } from "@parapka/crypto";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it } from "vitest";

import { App } from "./App";
import { createMemoryDatabase } from "./data/memory-database";
import type { Profile } from "./data/profile";
import { createProfileRepository } from "./data/profile-repository";
import { pl } from "./i18n/pl";
import { createPinStore } from "./lock/pin-store";
import type { Platform } from "./platform/context";
import { createMemoryKeyStore } from "./platform/memory-key-store";
import { createWebSodium } from "./platform/web-sodium";

let sodium: Sodium;

beforeAll(async () => {
  sodium = await createWebSodium();
});

afterEach(cleanup);

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

function memoryPlatform(): Platform {
  return {
    sodium,
    keyStore: createMemoryKeyStore(),
    clock: { nowMs: () => 1_000 },
    database: createMemoryDatabase(),
  };
}

it("shows the loading screen until the platform is ready", async () => {
  render(<App createPlatform={() => Promise.resolve(memoryPlatform())} />);
  expect(screen.getByText(pl.app.loading)).toBeTruthy();
  expect(await screen.findByText(pl.onboarding.name.title)).toBeTruthy();
});

it("shows an error when the platform fails to start", async () => {
  render(<App createPlatform={() => Promise.reject(new Error("no"))} />);
  expect(await screen.findByText(pl.app.error)).toBeTruthy();
});

it("shows onboarding, not the tabs, when there is no profile", async () => {
  render(<App createPlatform={() => Promise.resolve(memoryPlatform())} />);
  expect(await screen.findByText(pl.onboarding.name.title)).toBeTruthy();
  expect(screen.queryAllByRole("tab")).toHaveLength(0);
});

it("shows the tabs without the cycle tab for a saved profile without a cycle", async () => {
  const platform = memoryPlatform();
  await createProfileRepository(platform.database).save(profile);
  render(<App createPlatform={() => Promise.resolve(platform)} />);
  expect(await screen.findAllByRole("tab")).toHaveLength(4);
  expect(screen.queryByText(pl.onboarding.name.title)).toBeNull();
});

it("shows the cycle tab for a profile with a cycle", async () => {
  const platform = memoryPlatform();
  await createProfileRepository(platform.database).save({
    ...profile,
    cycle: "yes",
  });
  render(<App createPlatform={() => Promise.resolve(platform)} />);
  expect(await screen.findAllByRole("tab")).toHaveLength(5);
});

it("asks for the PIN before the content when a PIN is set", async () => {
  const platform = memoryPlatform();
  await createProfileRepository(platform.database).save(profile);
  await createPinStore({
    database: platform.database,
    sodium,
    clock: platform.clock,
  }).setPin("123456");
  render(<App createPlatform={() => Promise.resolve(platform)} />);
  expect(await screen.findByText(pl.lock.pin.unlockTitle)).toBeTruthy();
  expect(screen.queryAllByRole("tab")).toHaveLength(0);
});
