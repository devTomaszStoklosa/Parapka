// @vitest-environment jsdom
import type { Sodium } from "@parapka/crypto";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

import { createCycleSettingsRepository } from "../data/cycle-settings";
import { createMemoryDatabase } from "../data/memory-database";
import { createProfileRepository } from "../data/profile-repository";
import { pl } from "../i18n/pl";
import { createPinStore } from "../lock/pin-store";
import { webSha256 } from "../platform/sha256";
import { PlatformProvider, type Platform } from "../platform/context";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { createWebSodium } from "../platform/web-sodium";
import { OnboardingFlow } from "./OnboardingFlow";

const o = pl.onboarding;
let sodium: Sodium;

beforeAll(async () => {
  sodium = await createWebSodium();
});

afterEach(cleanup);

function setup() {
  const platform: Platform = {
    sodium,
    keyStore: createMemoryKeyStore(),
    clock: { nowMs: () => Date.UTC(2026, 10, 9, 12) },
    database: createMemoryDatabase(),
    sha256: webSha256,
    relayUrl: "unused",
    appUrl: "unused",
  };
  const onDone = vi.fn();
  render(
    <PlatformProvider platform={platform}>
      <OnboardingFlow onDone={onDone} />
    </PlatformProvider>,
  );
  return { platform, onDone };
}

const title = () => screen.getByRole("heading").textContent;
const click = (role: string, name: string) => {
  fireEvent.click(screen.getByRole(role, { name }));
};
const next = () => {
  click("button", o.next);
};
const type = (label: string, value: string) => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

/** Steps from the name to the cycle question. */
function answerCommonSteps() {
  type(o.name.label, "Ola");
  next();
  click("radio", o.formFeminine);
  next();
  click("checkbox", o.adult.confirm.feminine);
  next();
  click("radio", o.tenure["3-7"]);
  next();
  click("radio", o.children.yes);
  type(o.children.count, "2");
  next();
  click("checkbox", o.goals.closeness);
  click("checkbox", o.goals.other);
  type(o.goals.otherLabel, "Podróż");
  next();
}

async function finish(onDone: ReturnType<typeof vi.fn>) {
  click("button", o.finish);
  await waitFor(() => {
    expect(onDone).toHaveBeenCalledTimes(1);
  });
}

it("does not leave the age step without the confirmation", () => {
  setup();
  type(o.name.label, "Ola");
  next();
  click("radio", o.formNeutral);
  next();
  expect(title()).toBe(o.adult.title);
  next();
  expect(title()).toBe(o.adult.title);
  expect(screen.getByText(o.adult.required)).toBeTruthy();
  click("checkbox", o.adult.confirm.neutral);
  next();
  expect(title()).toBe(o.tenure.title);
});

it("goes back on every step", () => {
  setup();
  type(o.name.label, "Ola");
  next();
  expect(title()).toBe(o.form.title);
  click("button", o.back);
  expect(title()).toBe(o.name.title);
});

it("saves the profile and the cycle settings on the path with a cycle", async () => {
  const { platform, onDone } = setup();
  answerCommonSteps();
  expect(title()).toBe(o.cycle.title);
  click("radio", o.cycle.yes);
  next();

  expect(title()).toBe(o.disclaimer.title);
  expect(screen.getByText(o.disclaimer.text)).toBeTruthy();
  next();
  expect(title()).toBe(o.disclaimer.title);
  click("checkbox", o.disclaimer.confirm);
  next();

  expect(title()).toBe(o.cycleSetup.title);
  type(o.cycleSetup.lastPeriod, "2026-10-01");
  type(o.cycleSetup.cycleLength, "50");
  next();
  expect(title()).toBe(o.cycleSetup.title);
  expect(screen.getByText(o.cycleSetup.invalid)).toBeTruthy();
  type(o.cycleSetup.cycleLength, "30");
  next();

  expect(title()).toBe(o.pin.title);
  click("button", o.pin.skip);
  next();
  expect(title()).toBe(o.device.title);
  expect(screen.getByText(o.device.text)).toBeTruthy();
  await finish(onDone);

  expect(await createProfileRepository(platform.database).get()).toEqual({
    name: "Ola",
    form: "feminine",
    adultConfirmed: true,
    relationshipTenure: "3-7",
    hasChildren: true,
    childrenCount: 2,
    goals: ["closeness", "other"],
    otherGoalText: "Podróż",
    shareGoalsWithPartner: false,
    cycle: "yes",
    pinDecision: "skipped",
  });
  expect(await createCycleSettingsRepository(platform.database).get()).toEqual({
    unknown: false,
    lastPeriodStart: "2026-10-01",
    cycleLength: 30,
    periodLength: 5,
  });
});

it("keeps the default values for 'nie wiem'", async () => {
  const { platform, onDone } = setup();
  answerCommonSteps();
  click("radio", o.cycle.yes);
  next();
  click("checkbox", o.disclaimer.confirm);
  next();
  click("checkbox", o.cycleSetup.unknown);
  next();
  click("button", o.pin.skip);
  next();
  await finish(onDone);
  expect(await createCycleSettingsRepository(platform.database).get()).toEqual({
    unknown: true,
    lastPeriodStart: null,
    cycleLength: 28,
    periodLength: 5,
  });
});

it("skips the cycle steps and saves no cycle settings without a cycle", async () => {
  const { platform, onDone } = setup();
  answerCommonSteps();
  click("radio", o.cycle.no);
  next();
  expect(title()).toBe(o.pin.title);
  click("button", o.pin.skip);
  next();
  expect(title()).toBe(o.device.title);
  await finish(onDone);
  const saved = await createProfileRepository(platform.database).get();
  expect(saved?.cycle).toBe("no");
  expect(await createCycleSettingsRepository(platform.database).get()).toBe(
    null,
  );
});

function enterPin(pin: string) {
  pin.split("").forEach((digit, index) => {
    type(pl.lock.pin.digit.replace("{position}", String(index + 1)), digit);
  });
}

it("goes back from the PIN screen and allows skipping", () => {
  setup();
  answerCommonSteps();
  click("radio", o.cycle["not-now"]);
  next();
  click("button", o.pin.set);
  click("button", o.back);
  expect(title()).toBe(o.pin.title);
  click("button", o.pin.skip);
  next();
  expect(title()).toBe(o.device.title);
});

it("rejects a start of the last period in the future", () => {
  setup();
  answerCommonSteps();
  click("radio", o.cycle.yes);
  next();
  click("checkbox", o.disclaimer.confirm);
  next();
  type(o.cycleSetup.lastPeriod, "2099-01-01");
  expect(
    screen.getByRole("button", { name: o.next }).getAttribute("aria-disabled"),
  ).toBe("true");
  type(o.cycleSetup.lastPeriod, "2026-11-09");
  expect(
    screen.getByRole("button", { name: o.next }).getAttribute("aria-disabled"),
  ).not.toBe("true");
});

it("sets the PIN in the PIN step", async () => {
  const { platform, onDone } = setup();
  answerCommonSteps();
  click("radio", o.cycle["not-now"]);
  next();
  click("button", o.pin.set);
  enterPin("123456");
  await screen.findByText(pl.lock.pin.confirmTitle);
  enterPin("123456");
  await screen.findByText(o.pin.isSet);
  next();
  await finish(onDone);
  const store = createPinStore({
    database: platform.database,
    sodium,
    clock: platform.clock,
  });
  expect(await store.verifyPin("123456")).toBe(true);
  const saved = await createProfileRepository(platform.database).get();
  expect(saved?.pinDecision).toBe("set");
});

it("saves the alternative answers: no children, a toggled goal, shared goals", async () => {
  const { platform, onDone } = setup();
  type(o.name.label, "Ola");
  next();
  click("radio", o.formMasculine);
  next();
  click("checkbox", o.adult.confirm.masculine);
  next();
  click("radio", o.tenure["<1"]);
  next();
  click("radio", o.children.yes);
  click("radio", o.children.no);
  next();
  click("checkbox", o.goals.closeness);
  click("checkbox", o.goals.closeness);
  click("checkbox", o.goals.passion);
  click("switch", o.goals.share);
  next();
  click("radio", o.cycle.yes);
  next();
  click("checkbox", o.disclaimer.confirm);
  next();
  type(o.cycleSetup.lastPeriod, "2026-10-01");
  type(o.cycleSetup.periodLength, "4");
  next();
  click("button", o.pin.skip);
  next();
  await finish(onDone);

  const saved = await createProfileRepository(platform.database).get();
  expect(saved).toMatchObject({
    hasChildren: false,
    childrenCount: 0,
    goals: ["passion"],
    shareGoalsWithPartner: true,
  });
  expect(
    (await createCycleSettingsRepository(platform.database).get())
      ?.periodLength,
  ).toBe(4);
});
