// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import type { Profile } from "../data/profile";
import { createProfileRepository } from "../data/profile-repository";
import { pl } from "../i18n/pl";
import { PlatformProvider, type Platform } from "../platform/context";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { webSha256 } from "../platform/sha256";
import { createWebSodium } from "../platform/web-sodium";
import { CyclePanelSettings } from "./CyclePanelSettings";

afterEach(cleanup);

const p = pl.cycle.panel;
const o = pl.onboarding;

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

async function show(cycle: Profile["cycle"], fail = false) {
  const memory = createMemoryDatabase();
  const database = {
    ...memory,
    delete: (collection: string, id: string) =>
      fail ? Promise.reject(new Error("disk")) : memory.delete(collection, id),
  };
  const platform: Platform = {
    sodium: await createWebSodium(),
    keyStore: createMemoryKeyStore(),
    clock: { nowMs: () => new Date(2026, 10, 14, 12).getTime() },
    database,
    sha256: webSha256,
    relayUrl: "unused",
    appUrl: "unused",
  };
  const profiles = createProfileRepository(memory);
  await profiles.save({ ...profile, cycle });
  render(
    <PlatformProvider platform={platform}>
      <CyclePanelSettings />
    </PlatformProvider>,
  );
  return { memory, profiles, database };
}

const press = async (name: string, role = "button") => {
  fireEvent.click(await screen.findByRole(role, { name }));
};
const type = (label: string, value: string) => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};
const saveButton = () => screen.getByRole("button", { name: p.save });

it("goes on only after the message is confirmed, and saves valid values", async () => {
  const { memory, profiles } = await show("no");
  await press(p.enable);
  expect(screen.getByText(o.disclaimer.text)).toBeTruthy();
  expect(screen.queryByLabelText(o.cycleSetup.cycleLength)).toBeNull();
  expect(saveButton().hasAttribute("disabled")).toBe(true);

  await press(o.disclaimer.confirm, "checkbox");
  type(o.cycleSetup.lastPeriod, "2026-11-01");
  type(o.cycleSetup.cycleLength, "50");
  expect(screen.getByText(o.cycleSetup.invalid)).toBeTruthy();
  expect(saveButton().hasAttribute("disabled")).toBe(true);
  type(o.cycleSetup.cycleLength, "30");
  fireEvent.click(saveButton());

  await waitFor(async () => {
    expect((await profiles.get())?.cycle).toBe("yes");
  });
  expect(await memory.get("cycle-settings", "me")).toMatchObject({
    unknown: false,
    lastPeriodStart: "2026-11-01",
    cycleLength: 30,
    periodLength: 5,
  });
  expect(await screen.findByRole("button", { name: p.disable })).toBeTruthy();
});

it("saves the defaults for 'Nie wiem' and changes nothing on cancel", async () => {
  const { memory, profiles } = await show("no");
  await press(p.enable);
  await press(p.cancel);
  expect(screen.getByRole("button", { name: p.enable })).toBeTruthy();
  expect(await profiles.get()).toMatchObject({ cycle: "no" });

  await press(p.enable);
  await press(o.disclaimer.confirm, "checkbox");
  await press(o.cycleSetup.unknown, "checkbox");
  fireEvent.click(saveButton());
  await screen.findByRole("button", { name: p.disable });
  expect(await memory.get("cycle-settings", "me")).toMatchObject({
    unknown: true,
  });
});

it("keeps everything when the removal is cancelled", async () => {
  const { memory, profiles } = await show("yes");
  await memory.put("period-logs", "p1", { id: "p1" });
  await press(p.disable);
  expect(screen.getByText(p.confirm)).toBeTruthy();
  await press(p.cancel);
  expect(screen.getByRole("button", { name: p.disable })).toBeTruthy();
  expect(await memory.get("period-logs", "p1")).not.toBeNull();
  expect((await profiles.get())?.cycle).toBe("yes");
});

it("removes the data and turns the panel off after the confirmation", async () => {
  const { memory, profiles } = await show("yes");
  await memory.put("period-logs", "p1", { id: "p1" });
  await press(p.disable);
  await press(p.confirmDisable);
  expect(await screen.findByRole("button", { name: p.enable })).toBeTruthy();
  expect(await memory.list("period-logs")).toEqual([]);
  expect((await profiles.get())?.cycle).toBe("no");
});

it("shows the failure, keeps the panel on and does not crash", async () => {
  const { memory, profiles } = await show("yes", true);
  await memory.put("period-logs", "p1", { id: "p1" });
  await press(p.disable);
  await press(p.confirmDisable);
  expect((await screen.findByRole("alert")).textContent).toBe(p.failed);
  expect((await profiles.get())?.cycle).toBe("yes");
  expect(screen.getByText(p.confirm)).toBeTruthy();
});
