// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { defaultConsent } from "../consent/consent-model";
import { wireConsent } from "../consent/wiring";
import { wireCycle, wireCycleHints } from "../cycle/wiring";
import { createProfileRepository } from "../data/profile-repository";
import { pl } from "../i18n/pl";
import { PlatformProvider, type Platform } from "../platform/context";
import { createPauseRepository } from "../sync/pause-repository";
import { profile } from "../sync/wiring-test-support";
import { press, setup, useSodium } from "../chores/planner-test-support";
import { OwnHintCard } from "./OwnHintCard";

useSodium();
afterEach(cleanup);

const c = pl.cycle.ownHint;
const hintAt = (date: string, text = `Tekst ${date}`) => ({
  templateId: "t" + date,
  contentVersion: 1,
  category: "space" as const,
  date,
  text,
});

/** A phone whose consent for the hints is `shared`; the person has the cycle. */
async function phone(paired: boolean, shared = true) {
  const { platform } = await setup(paired);
  const cycleProfile = { ...profile, cycle: "yes" } as const;
  await createProfileRepository(platform.database).save(cycleProfile);
  await wireConsent(platform).consent.save({
    ...defaultConsent(cycleProfile),
    CYCLE_HINTS: shared,
  });
  return platform;
}

const showCard = (platform: Platform, onOpenCycle = vi.fn()) => {
  render(
    <PlatformProvider platform={platform}>
      <OwnHintCard onOpenCycle={onOpenCycle} />
    </PlatformProvider>,
  );
  return onOpenCycle;
};

it("says one sentence for each state of sharing", async () => {
  const noPair = await phone(false);
  showCard(noPair);
  expect(await screen.findByText(c.noPair)).toBeTruthy();
  cleanup();

  const noConsent = await phone(true, false);
  showCard(noConsent);
  expect(await screen.findByText(c.noConsent)).toBeTruthy();
  cleanup();

  const paused = await phone(true);
  await createPauseRepository(paused.database).setPaused(true);
  showCard(paused);
  expect(await screen.findByText(c.paused)).toBeTruthy();
  cleanup();

  showCard(await phone(true));
  expect(await screen.findByText(c.shared)).toBeTruthy();
  expect(screen.getByRole("heading", { name: c.title })).toBeTruthy();
});

it("shows the hint of today, the next days and the folded history", async () => {
  const platform = await phone(true);
  const { hints } = wireCycleHints(platform);
  for (const date of [
    "2026-11-10",
    "2026-11-09",
    "2026-11-11",
    "2026-11-12",
    "2026-11-13",
  ]) {
    await hints.put(hintAt(date));
  }
  showCard(platform);
  expect(await screen.findByText("Tekst 2026-11-11")).toBeTruthy();
  expect(screen.getByRole("heading", { name: c.upcoming })).toBeTruthy();
  expect(screen.getByText(`${c.tomorrow} (${c.upcomingNote})`)).toBeTruthy();
  expect(screen.getByText("Tekst 2026-11-12")).toBeTruthy();
  expect(screen.getByText(`${c.dayAfter} (${c.upcomingNote})`)).toBeTruthy();
  expect(screen.getByText("Tekst 2026-11-13")).toBeTruthy();
  expect(screen.queryByText("Tekst 2026-11-10")).toBeNull();
  await press(c.history, "button");
  const days = screen.getAllByText(/^(10|9) listopada$/);
  expect(days.map((day) => day.textContent)).toEqual([
    "10 listopada",
    "9 listopada",
  ]);
  expect(screen.getByText("Tekst 2026-11-09")).toBeTruthy();
});

it("shows only the days that have a hint", async () => {
  const platform = await phone(true);
  const { hints } = wireCycleHints(platform);
  await hints.put(hintAt("2026-11-13"));
  showCard(platform);
  expect(await screen.findByText(c.none)).toBeTruthy();
  expect(screen.queryByText(c.tomorrow, { exact: false })).toBeNull();
  expect(screen.getByText(c.dayAfter, { exact: false })).toBeTruthy();
});

it("says there is no hint and sends to the Cycle tab without a period", async () => {
  const onOpenCycle = showCard(await phone(true));
  expect(await screen.findByText(c.none)).toBeTruthy();
  expect(screen.queryByRole("button", { name: c.history })).not.toBeNull();
  await press(c.openCycle, "button");
  expect(onOpenCycle).toHaveBeenCalledTimes(1);
});

it("does not send to the Cycle tab with a saved period", async () => {
  const platform = await phone(true);
  await wireCycle(platform).savePeriod({
    id: "p1",
    startDate: "2026-11-01",
    endDate: null,
  });
  showCard(platform);
  await screen.findByText(c.shared);
  expect(screen.queryByRole("button", { name: c.openCycle })).toBeNull();
});

it("loads the card again after a change of the sources", async () => {
  const platform = await phone(true);
  showCard(platform);
  expect(await screen.findByText(c.none)).toBeTruthy();
  await act(() => wireCycleHints(platform).hints.put(hintAt("2026-11-11")));
  expect(await screen.findByText("Tekst 2026-11-11")).toBeTruthy();
  await act(() => createPauseRepository(platform.database).setPaused(true));
  expect(await screen.findByText(c.paused)).toBeTruthy();
});

it("says so when the hints did not load and does not crash", async () => {
  const platform = await phone(true);
  vi.spyOn(wireCycleHints(platform).hints, "range").mockRejectedValue(
    new Error("broken"),
  );
  showCard(platform);
  expect((await screen.findByRole("alert")).textContent).toBe(c.failed);
  await waitFor(() => {
    expect(screen.queryByRole("button", { name: c.openCycle })).toBeNull();
  });
});

/** A phone with a period and a saved hint for today (2026-11-11). */
async function phoneWithHint() {
  const platform = await phone(true);
  await wireCycleHints(platform).hints.put(hintAt("2026-11-11", "Dzisiejsza"));
  await wireCycle(platform).savePeriod({
    id: "p1",
    startDate: "2026-11-01",
    endDate: null,
  });
  return platform;
}

it("skips the hint of today, tells so and brings it back", async () => {
  showCard(await phoneWithHint());
  await press(c.skip, "button");
  expect(await screen.findByText(c.skipped)).toBeTruthy();
  expect(screen.getByText(c.none)).toBeTruthy();
  expect(screen.queryByRole("button", { name: c.skip })).toBeNull();
  await press(c.restore, "button");
  expect(await screen.findByText("Dzisiejsza")).toBeTruthy();
  expect(screen.queryByText(c.skipped)).toBeNull();
});

it("lets choose one of the candidates and sends it", async () => {
  const platform = await phoneWithHint();
  const [, second] =
    await wireCycleHints(platform).choice.candidates("2026-11-11");
  showCard(platform);
  await press(c.chooseOther, "button");
  expect(
    await screen.findByRole("radiogroup", { name: c.candidates }),
  ).toBeTruthy();
  expect(screen.getAllByRole("radio")).toHaveLength(3);
  expect(
    screen.getByRole("button", { name: c.send }).hasAttribute("disabled"),
  ).toBe(true);
  await press(second?.text ?? "", "radio");
  await press(c.send, "button");
  await waitFor(() => {
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });
  await waitFor(() => {
    expect(screen.getAllByText(second?.text ?? "")).toHaveLength(1);
  });
  expect(screen.queryByText("Dzisiejsza")).toBeNull();
});

it("has no actions without a hint of today", async () => {
  showCard(await phone(true));
  await screen.findByText(c.none);
  expect(screen.queryByRole("button", { name: c.skip })).toBeNull();
  expect(screen.queryByRole("button", { name: c.chooseOther })).toBeNull();
});

it("shows a message and stays alive when a write or a choice fails", async () => {
  const platform = await phoneWithHint();
  const { choice } = wireCycleHints(platform);
  vi.spyOn(choice, "skip").mockRejectedValue(new Error("broken"));
  vi.spyOn(choice, "choose").mockResolvedValue(false);
  showCard(platform);
  await press(c.skip, "button");
  expect((await screen.findByRole("alert")).textContent).toBe(c.actionFailed);
  await press(c.chooseOther, "button");
  await waitFor(() => {
    expect(screen.queryByRole("alert")).toBeNull();
  });
  fireEvent.click((await screen.findAllByRole("radio"))[0] as HTMLElement);
  await press(c.send, "button");
  expect((await screen.findByRole("alert")).textContent).toBe(c.actionFailed);
});
