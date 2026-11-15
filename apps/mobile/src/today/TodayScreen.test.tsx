// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import {
  setupCheckin,
  showToday,
  useSodium,
} from "../checkin/checkin-test-screen-support";
import { wireCycleHints } from "../cycle/wiring";
import { pl } from "../i18n/pl";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { PlatformProvider, type Platform } from "../platform/context";
import { TodayScreen } from "./TodayScreen";

useSodium();
afterEach(cleanup);

it("shows the title and the check-in card", async () => {
  const { platform } = await setupCheckin(true);
  showToday(platform);
  expect(screen.getByRole("heading").textContent).toBe(pl.screens.today.title);
  expect(await screen.findByText(pl.checkin.form.save)).toBeTruthy();
});

it("shows the hint of the partner above the check-in card", async () => {
  const { platform } = await setupCheckin(true);
  const field = (value: string) => ({ value, hlc: "000000000000001-00000-a" });
  await wireCycleHints(platform).received.merge({
    entity: "Hint",
    id: "h1",
    op: "upsert",
    fields: {
      forDate: field("2026-11-11"),
      text: field("Tekst h1"),
      category: field("space"),
      status: field("scheduled"),
    },
  });
  showToday(platform);
  await waitFor(() => {
    const text = document.body.textContent;
    expect(text).toContain("Tekst h1");
    expect(text.indexOf("Tekst h1")).toBeLessThan(
      text.indexOf(pl.checkin.form.save),
    );
  });
});

it("has no card of the partner without a received hint", async () => {
  const { platform } = await setupCheckin(true);
  showToday(platform);
  await screen.findByText(pl.checkin.form.save);
  expect(screen.queryByText(pl.todayHint.none)).toBeNull();
  expect(
    screen.queryByRole("radiogroup", { name: pl.todayHint.reactions }),
  ).toBeNull();
});

const cycleHint = (platform: Platform) =>
  wireCycleHints(platform).hints.put({
    templateId: "t",
    contentVersion: 1,
    category: "space",
    date: "2026-11-11",
    text: "Własna wskazówka",
  });

it("shows both cards when both people have the cycle (FR-CYC-14)", async () => {
  const { platform } = await setupCheckin(true);
  const field = (value: string) => ({ value, hlc: "000000000000001-00000-a" });
  await wireCycleHints(platform).received.merge({
    entity: "Hint",
    id: "h1",
    op: "upsert",
    fields: {
      forDate: field("2026-11-11"),
      text: field("Tekst h1"),
      category: field("space"),
      status: field("scheduled"),
    },
  });
  await cycleHint(platform);
  const onOpenCycle = vi.fn();
  render(
    <PlatformProvider platform={platform}>
      <TodayScreen onOpenCycle={onOpenCycle} />
    </PlatformProvider>,
  );
  expect(await screen.findByText("Własna wskazówka")).toBeTruthy();
  expect(screen.getByText("Tekst h1")).toBeTruthy();
  expect(screen.getByText(pl.cycle.ownHint.title)).toBeTruthy();
});

it("has no card of the own hint without the cycle panel", async () => {
  const { platform } = await setupCheckin(true);
  await cycleHint(platform);
  showToday(platform);
  await screen.findByText(pl.checkin.form.save);
  expect(screen.queryByText(pl.cycle.ownHint.title)).toBeNull();
  expect(screen.queryByText("Własna wskazówka")).toBeNull();
});
