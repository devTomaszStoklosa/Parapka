// @vitest-environment jsdom
import type { Sodium } from "@parapka/crypto";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

import { App } from "./App";
import { createMemoryDatabase } from "./data/memory-database";
import type { Profile } from "./data/profile";
import { createProfileRepository } from "./data/profile-repository";
import { pl } from "./i18n/pl";
import { createPinStore } from "./lock/pin-store";
import type { Platform } from "./platform/context";
import { webSha256 } from "./platform/sha256";
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
    sha256: webSha256,
    relayUrl: "unused",
    appUrl: "unused",
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

const withLaunch = (platform: Platform, text: string | null): Platform => ({
  ...platform,
  launchInvitation: () => text,
});

it("opens the accept screen for a launch link when a profile exists", async () => {
  const platform = withLaunch(memoryPlatform(), "abc");
  await createProfileRepository(platform.database).save(profile);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("offline"))),
  );
  render(<App createPlatform={() => Promise.resolve(platform)} />);
  expect(await screen.findByText(pl.pairing.unavailable)).toBeTruthy();
  expect(screen.queryAllByRole("tab")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: pl.pairing.close }));
  expect(await screen.findAllByRole("tab")).toHaveLength(4);
  vi.unstubAllGlobals();
});

it("keeps the launch link until onboarding is done", async () => {
  const platform = withLaunch(memoryPlatform(), "abc");
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("offline"))),
  );
  render(<App createPlatform={() => Promise.resolve(platform)} />);
  expect(await screen.findByText(pl.onboarding.name.title)).toBeTruthy();
  expect(screen.queryByText(pl.pairing.unavailable)).toBeNull();

  const o = pl.onboarding;
  const next = () => {
    fireEvent.click(screen.getByRole("button", { name: o.next }));
  };
  fireEvent.change(screen.getByLabelText(o.name.label), {
    target: { value: "Ola" },
  });
  next();
  fireEvent.click(screen.getByRole("radio", { name: o.formFeminine }));
  next();
  fireEvent.click(
    screen.getByRole("checkbox", { name: o.adult.confirm.feminine }),
  );
  next();
  fireEvent.click(screen.getByRole("radio", { name: o.tenure["3-7"] }));
  next();
  fireEvent.click(screen.getByRole("radio", { name: o.children.no }));
  next();
  fireEvent.click(screen.getByRole("checkbox", { name: o.goals.closeness }));
  next();
  fireEvent.click(screen.getByRole("radio", { name: o.cycle.no }));
  next();
  fireEvent.click(screen.getByRole("button", { name: o.pin.skip }));
  next();
  fireEvent.click(screen.getByRole("button", { name: o.finish }));

  expect(await screen.findByText(pl.pairing.unavailable)).toBeTruthy();
  expect(screen.queryAllByRole("tab")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: pl.pairing.close }));
  expect(await screen.findAllByRole("tab")).toHaveLength(4);
  vi.unstubAllGlobals();
});

it("shows an error when the database cannot be opened", async () => {
  const platform = memoryPlatform();
  platform.database = {
    ...platform.database,
    get: () => Promise.reject(new Error("no key")),
  };
  render(<App createPlatform={() => Promise.resolve(platform)} />);
  expect(await screen.findByText(pl.app.error)).toBeTruthy();
});

const o = pl.onboarding;
const click = (role: string, name: string) => {
  fireEvent.click(screen.getByRole(role, { name }));
};
const next = () => {
  click("button", o.next);
};
const type = (label: string, value: string) => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};
const enterPin = (pin: string) => {
  pin.split("").forEach((digit, index) => {
    type(pl.lock.pin.digit.replace("{position}", String(index + 1)), digit);
  });
};

it("does not lock right after a PIN was set in onboarding, but does on the next start", async () => {
  const platform = memoryPlatform();
  const { unmount } = render(
    <App createPlatform={() => Promise.resolve(platform)} />,
  );
  await screen.findByText(o.name.title);
  type(o.name.label, "Ola");
  next();
  click("radio", o.formFeminine);
  next();
  click("checkbox", o.adult.confirm.feminine);
  next();
  click("radio", o.tenure["3-7"]);
  next();
  click("radio", o.children.no);
  next();
  click("checkbox", o.goals.closeness);
  next();
  click("radio", o.cycle.no);
  next();
  click("button", o.pin.set);
  enterPin("123456");
  await screen.findByText(pl.lock.pin.confirmTitle);
  enterPin("123456");
  await screen.findByText(o.pin.isSet);
  next();
  click("button", o.finish);
  expect(await screen.findAllByRole("tab")).toHaveLength(4);
  expect(screen.queryByText(pl.lock.pin.unlockTitle)).toBeNull();

  unmount();
  render(<App createPlatform={() => Promise.resolve(platform)} />);
  expect(await screen.findByText(pl.lock.pin.unlockTitle)).toBeTruthy();
  expect(screen.queryAllByRole("tab")).toHaveLength(0);
});
