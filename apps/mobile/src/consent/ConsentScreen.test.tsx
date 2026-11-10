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
import { createConsentRepository } from "./consent-repository";
import { PairingScreen } from "../pairing/PairingScreen";
import { ConsentScreen } from "./ConsentScreen";

const c = pl.consent;

afterEach(cleanup);

async function open(cycle: Profile["cycle"], shareGoals = false) {
  const database = createMemoryDatabase();
  const profiles = createProfileRepository(database);
  await profiles.save({
    cycle,
    shareGoalsWithPartner: shareGoals,
  } as Profile);
  const consent = createConsentRepository({
    database,
    clock: { nowMs: () => 42 },
    profiles,
  });
  const onSaved = vi.fn();
  await act(async () => {
    render(
      <ConsentScreen consent={consent} profiles={profiles} onSaved={onSaved} />,
    );
    await Promise.resolve();
  });
  return { consent, onSaved };
}

const checkbox = (category: keyof typeof c.categories) =>
  screen.queryByRole("checkbox", { name: c.categories[category].title });

it("shows the categories with descriptions and the notes", async () => {
  await open("yes");
  for (const category of Object.values(c.categories)) {
    expect(screen.getByRole("checkbox", { name: category.title })).toBeTruthy();
    expect(screen.getByText(category.description)).toBeTruthy();
  }
  expect(screen.getByText(c.always)).toBeTruthy();
  expect(screen.getByText(c.deletion)).toBeTruthy();
  expect(checkbox("SHARED_CHORES")?.getAttribute("aria-checked")).toBe("true");
  expect(checkbox("CHECKIN")?.getAttribute("aria-checked")).toBe("false");
});

it("hides cycle hints from a person without a cycle", async () => {
  await open("no");
  expect(checkbox("CYCLE_HINTS")).toBeNull();
  expect(checkbox("CHECKIN")).toBeTruthy();
});

it("starts goals from the onboarding switch", async () => {
  await open("no", true);
  expect(checkbox("ONBOARDING_GOALS")?.getAttribute("aria-checked")).toBe(
    "true",
  );
});

it("saves the chosen states with the date", async () => {
  const { consent, onSaved } = await open("yes");
  fireEvent.click(checkbox("CHECKIN") as HTMLElement);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: c.save }));
    await Promise.resolve();
  });
  expect(onSaved).toHaveBeenCalledOnce();
  const record = await consent.current();
  expect(record?.states.CHECKIN).toBe(true);
  expect(record?.states.SHARED_MENTAL_LOAD).toBe(true);
  expect(record?.savedAtMs).toBe(42);
});

it("says so when the consent cannot be saved", async () => {
  const consent = { save: vi.fn(() => Promise.reject(new Error("disk"))) };
  const onSaved = vi.fn();
  await act(async () => {
    render(
      <ConsentScreen
        consent={consent}
        profiles={{ get: () => Promise.resolve(null) }}
        onSaved={onSaved}
      />,
    );
    await Promise.resolve();
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: c.save }));
    await Promise.resolve();
  });
  expect(screen.getByRole("alert").textContent).toBe(c.saveFailed);
  expect(onSaved).not.toHaveBeenCalled();
});

it("is asked of a confirmed pair that has no consent yet", async () => {
  const { consent } = await open("no");
  cleanup();
  const unused = {} as never;
  const pair = { state: "confirmed" } as never;
  await act(async () => {
    render(
      <PairingScreen
        inviter={unused}
        acceptor={unused}
        pairs={{ current: () => Promise.resolve(pair) }}
        consent={consent}
        profiles={{ get: () => Promise.resolve(null) }}
        loadSafetyCode={() => Promise.resolve("")}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(screen.getByText(c.title)).toBeTruthy();
  expect(screen.queryByText(pl.pairing.paired)).toBeNull();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: c.save }));
    await Promise.resolve();
  });
  expect(screen.getByText(pl.pairing.paired)).toBeTruthy();
});

it("says so when the profile cannot be read", async () => {
  await act(async () => {
    render(
      <ConsentScreen
        consent={{ save: vi.fn() }}
        profiles={{ get: () => Promise.reject(new Error("disk")) }}
        onSaved={vi.fn()}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(screen.getByRole("alert").textContent).toBe(c.saveFailed);
});
