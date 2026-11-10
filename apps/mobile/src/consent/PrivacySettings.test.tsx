// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import type { Profile } from "../data/profile";
import { createProfileRepository } from "../data/profile-repository";
import { pl } from "../i18n/pl";
import { defaultConsent } from "./consent-model";
import { createConsentRepository } from "./consent-repository";
import { PrivacySettings } from "./PrivacySettings";

const c = pl.consent;

afterEach(cleanup);

async function open(given: boolean) {
  const database = createMemoryDatabase();
  const profiles = createProfileRepository(database);
  const profile = { cycle: "yes", shareGoalsWithPartner: false } as const;
  await profiles.save(profile as Profile);
  const time = { now: 1 };
  const consent = createConsentRepository({
    database,
    clock: { nowMs: () => time.now },
    profiles,
  });
  if (given) await consent.save(defaultConsent(profile));
  time.now = 99;
  await act(async () => {
    render(<PrivacySettings consent={consent} profiles={profiles} />);
    await Promise.resolve();
  });
  return consent;
}

it("says the consent comes after pairing when there is none", async () => {
  await open(false);
  expect(screen.getByText(c.settings.none)).toBeTruthy();
  expect(screen.queryByRole("checkbox")).toBeNull();
});

it("shows the saved states", async () => {
  await open(true);
  const chores = screen.getByRole("checkbox", {
    name: c.categories.SHARED_CHORES.title,
  });
  expect(chores.getAttribute("aria-checked")).toBe("true");
  expect(screen.getByText(c.categories.CYCLE_HINTS.description)).toBeTruthy();
});

it("saves a change and tells the listeners", async () => {
  const consent = await open(true);
  const listener = vi.fn();
  consent.onChange(listener);
  const checkin = screen.getByRole("checkbox", {
    name: c.categories.CHECKIN.title,
  });
  await act(async () => {
    fireEvent.click(checkin);
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(checkin.getAttribute("aria-checked")).toBe("true");
  expect(listener).toHaveBeenCalledWith({ category: "CHECKIN", enabled: true });
  const record = await consent.current();
  expect(record?.states.CHECKIN).toBe(true);
  expect(record?.savedAtMs).toBe(99);
});

it("shows an error when the saved consent cannot be read", async () => {
  const database = createMemoryDatabase();
  const profiles = createProfileRepository(database);
  const consent = {
    current: () => Promise.reject(new Error()),
    setCategory: vi.fn(),
  };
  await act(async () => {
    render(<PrivacySettings consent={consent} profiles={profiles} />);
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(screen.getByRole("alert").textContent).toBe(c.saveFailed);
});

it("shows an error when a change cannot be saved", async () => {
  const database = createMemoryDatabase();
  const profiles = createProfileRepository(database);
  const profile = { cycle: "yes", shareGoalsWithPartner: false } as const;
  await profiles.save(profile as Profile);
  const consent = {
    current: () =>
      Promise.resolve({
        states: defaultConsent(profile),
        savedAtMs: 1,
        textVersion: 1,
      }),
    setCategory: () => Promise.reject(new Error()),
  };
  await act(async () => {
    render(
      <PrivacySettings
        consent={
          consent as unknown as Parameters<typeof PrivacySettings>[0]["consent"]
        }
        profiles={profiles}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => {
    fireEvent.click(
      screen.getByRole("checkbox", { name: c.categories.CHECKIN.title }),
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(screen.getByRole("alert").textContent).toBe(c.saveFailed);
});

it("shows the switches when the consent is saved after the screen opened", async () => {
  const consent = await open(false);
  expect(screen.queryByRole("checkbox")).toBeNull();
  await act(async () => {
    await consent.save(
      defaultConsent({ cycle: "yes", shareGoalsWithPartner: false }),
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
  expect(screen.queryByText(c.settings.none)).toBeNull();
});
