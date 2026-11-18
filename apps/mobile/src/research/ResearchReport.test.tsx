// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { setup, useSodium } from "../chores/planner-test-support";
import type { Profile } from "../data/profile";
import { createProfileRepository } from "../data/profile-repository";
import { pl } from "../i18n/pl";
import { createMemoryFileShare } from "../platform/file-share";
import { PlatformProvider, type Platform } from "../platform/context";
import { createActivityLog } from "./activity-log";
import { ResearchReport } from "./ResearchReport";

useSodium();
afterEach(cleanup);

const texts = pl.research;
const DAY_MS = 86_400_000;

async function open(
  paired: boolean,
  options: { failWith?: Error; noShare?: boolean } = {},
) {
  const { platform, time, pairs } = await setup(paired);
  // The pair is confirmed with the real clock; the platform clock follows it.
  const confirmedAt = (await pairs.current())?.confirmedAtMs ?? time.now;
  time.now = confirmedAt;
  const fileShare = createMemoryFileShare(options.failWith);
  const withShare: Platform = {
    ...platform,
    fileShare: options.noShare ? undefined : fileShare,
  };
  const view = (p: Platform) =>
    render(
      <PlatformProvider platform={p}>
        <ResearchReport />
      </PlatformProvider>,
    );
  return {
    platform: withShare,
    fileShare,
    time,
    render: () => view(withShare),
  };
}

const toggle = () =>
  fireEvent.click(screen.getByRole("button", { name: texts.show }));
const shareButton = () => screen.getByRole("button", { name: texts.share });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

it("explains the report and shows nothing before it is opened", async () => {
  const { render: show, fileShare } = await open(true);
  show();
  expect(screen.queryByText(texts.contains)).toBeNull();
  toggle();
  expect(screen.getByText(texts.contains)).toBeTruthy();
  expect(screen.getByText(texts.excludes)).toBeTruthy();
  await screen.findByText(texts.labels.weeksSincePairing + ": 0");
  expect(fileShare.texts).toEqual([]);
});

it("says that the report makes sense after pairing, without the button", async () => {
  const { render: show } = await open(false);
  show();
  toggle();
  await screen.findByText(texts.noPair);
  expect(screen.queryByRole("button", { name: texts.share })).toBeNull();
});

it("shares the numbers of the preview and nothing else", async () => {
  const { render: show, fileShare, time, platform } = await open(true);
  const log = createActivityLog(platform.database);
  for (const day of [22, 23, 28]) {
    await log.recordOpen(time.now + (day - 1) * DAY_MS);
  }
  time.now += 28 * DAY_MS;
  show();
  toggle();
  await screen.findByText(texts.labels.activeDaysWeek4 + ": 3");
  expect(screen.getByText(texts.labels.weeksSincePairing + ": 4")).toBeTruthy();
  expect(fileShare.texts).toEqual([]);
  fireEvent.click(shareButton());
  await flush();
  const [shared] = fileShare.texts;
  expect(shared).toContain(texts.labels.activeDaysWeek4 + ": 3");
  expect(shared).toContain('"activeDaysWeek4": 3');
  expect(shared).toContain('"weeksSincePairing": 4');
  expect(screen.queryByText(texts.failed)).toBeNull();
});

it("does not hand any marker of the person or the pair to the share", async () => {
  const { render: show, fileShare, platform } = await open(true);
  const profile: Profile = {
    name: "ZNACZNIK-IMIE-OSOBY",
    form: "neutral",
    adultConfirmed: true,
    relationshipTenure: "1-3",
    hasChildren: false,
    childrenCount: 0,
    goals: [],
    otherGoalText: null,
    shareGoalsWithPartner: false,
    cycle: "yes",
    pinDecision: "set",
  };
  await createProfileRepository(platform.database).save(profile);
  await platform.database.put("profile", "partner", {
    name: "ZNACZNIK-IMIE-PARTNERA",
  });
  await platform.database.put("lock", "pin", { hash: "ZNACZNIK-PIN-929292" });
  await platform.keyStore.set(
    "marker",
    new TextEncoder().encode("ZNACZNIK-KLUCZ"),
  );
  show();
  toggle();
  fireEvent.click(await screen.findByRole("button", { name: texts.share }));
  await flush();
  const [shared = ""] = fileShare.texts;
  expect(shared).not.toBe("");
  for (const marker of [
    "ZNACZNIK",
    "device-me",
    "device-partner",
    "mailbox",
    "929292",
  ]) {
    expect(shared).not.toContain(marker);
  }
});

it("shows a calm message when sharing fails", async () => {
  const { render: show } = await open(true, { failWith: new Error("boom") });
  show();
  toggle();
  fireEvent.click(await screen.findByRole("button", { name: texts.share }));
  await screen.findByText(texts.failed);
});

it("has no share button without a file share", async () => {
  const { render: show } = await open(true, { noShare: true });
  show();
  toggle();
  await screen.findByText(texts.labels.weeksSincePairing + ": 0");
  expect(screen.queryByRole("button", { name: texts.share })).toBeNull();
});

it("collapses again and reports a failed read", async () => {
  const { render: show, platform } = await open(true);
  platform.database.list = () => Promise.reject(new Error("boom"));
  show();
  toggle();
  await screen.findByText(texts.failed);
  fireEvent.click(screen.getByRole("button", { name: texts.hide }));
  expect(screen.queryByText(texts.contains)).toBeNull();
});
