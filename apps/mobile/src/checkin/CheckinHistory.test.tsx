// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import type { CheckinAnswers } from "@parapka/domain";
import { afterEach, expect, it, vi } from "vitest";

import { receiveProfile } from "../chores/planner-test-support";
import { pl } from "../i18n/pl";
import { colors } from "../ui/theme";
import { windowOfWeek, type HistoryEntry } from "./checkin-history-model";
import {
  press,
  setupCheckin,
  showCard,
  useSodium,
} from "./checkin-test-screen-support";

const h = pl.checkin.history;
const mood = pl.checkin.form.mood;
const sunday = { weekday: 7, hour: 19, minute: 0 } as const;

useSodium();
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const a = (m: number, energy: number, closeness: number) =>
  ({ mood: m, energy, closeness }) as CheckinAnswers;

const entry = (
  week: string,
  own: CheckinAnswers,
  partner: CheckinAnswers | null = null,
): HistoryEntry => ({
  week,
  window: windowOfWeek(week, sunday),
  own,
  partner,
});

const open = async (entries: HistoryEntry[], paired = true, shared = true) => {
  const setup = await setupCheckin(paired, shared);
  vi.spyOn(setup.checkin, "history").mockResolvedValue(entries);
  showCard(setup.platform);
  await press(h.show);
  return setup;
};

const labels = () =>
  screen.getAllByRole("img").map((node) => node.getAttribute("aria-label"));

it("lists the weeks with their date ranges, the newest first", async () => {
  await open([
    entry("2026-W45", a(4, 3, 5)),
    entry("2026-W44", a(2, 2, 2)),
    entry("2026-W43", a(1, 1, 1)),
  ]);
  await screen.findByText(h.title);
  const titles = screen
    .getAllByRole("heading")
    .map((node) => node.textContent)
    .filter((text) => text.includes("–"));
  expect(titles).toEqual([
    "8–15 listopada",
    "1–8 listopada",
    "25 października – 1 listopada",
  ]);
});

it("toggles the section with the button of the card", async () => {
  await open([entry("2026-W45", a(4, 3, 5))]);
  await screen.findByText(h.title);
  expect(
    screen.getByRole("button", { name: h.hide }).getAttribute("aria-expanded"),
  ).toBe("true");
  await press(h.hide);
  expect(screen.queryByText(h.title)).toBeNull();
  expect(screen.getByRole("button", { name: h.show })).toBeTruthy();
});

it.each([
  ["without a pair", false, true],
  ["with the check-in off", true, false],
])("offers the history %s", async (_name, paired, shared) => {
  await open([entry("2026-W45", a(4, 3, 5))], paired, shared);
  await screen.findByText(h.title);
});

it("shows only the own answers when no week was revealed", async () => {
  await open([entry("2026-W45", a(4, 3, 5)), entry("2026-W44", a(2, 2, 2))]);
  await screen.findByText(`${mood}: 4 z 5`);
  expect(screen.getByText(`${mood}: 2 z 5`)).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/Partner|—/);
  expect(labels()).toHaveLength(6);
  expect(labels().join()).not.toContain(pl.checkin.results.partner);
});

it("draws the series from the oldest week and the partner only when revealed", async () => {
  await open([
    entry("2026-W45", a(4, 3, 5), a(1, 2, 3)),
    entry("2026-W44", a(2, 2, 2)),
  ]);
  await screen.findByText(h.title);
  const moodLabels = labels().slice(0, 3);
  expect(moodLabels).toEqual([
    "1–8 listopada, Ty: 2 z 5",
    "8–15 listopada, Ty: 4 z 5",
    "8–15 listopada, Partner: 1 z 5",
  ]);
  expect(screen.getByText(`${mood} — Ty: 4 z 5, Partner: 1 z 5`)).toBeTruthy();
  expect(screen.getByText(`${mood} — Ty: 2 z 5, Partner: —`)).toBeTruthy();
});

it("names the partner from the profile and colors by person only", async () => {
  const setup = await setupCheckin(true);
  await receiveProfile(setup.platform, "Ola");
  vi.spyOn(setup.checkin, "history").mockResolvedValue([
    entry("2026-W45", a(5, 5, 5), a(1, 1, 1)),
  ]);
  showCard(setup.platform);
  await press(h.show);
  await screen.findAllByText("Ola");
  const own = screen.getAllByLabelText(/Ty: 5 z 5/)[0];
  const partner = screen.getAllByLabelText(/Ola: 1 z 5/)[0];
  expect(own?.getAttribute("style")).toContain(hexToRgb(colors.personA));
  expect(partner?.getAttribute("style")).toContain(hexToRgb(colors.personB));
});

it("has no sums, comparisons or fixed wide widths", async () => {
  await open([entry("2026-W45", a(4, 3, 5), a(1, 2, 3))]);
  await screen.findByText(h.title);
  expect(document.body.textContent).not.toMatch(
    /średni|suma|lepiej|gorzej|↑|↓|%/i,
  );
  for (const node of document.querySelectorAll("[style]")) {
    const width = /(?:^|;\s*)width:\s*(\d+)px/.exec(
      node.getAttribute("style") ?? "",
    );
    expect(Number(width?.[1] ?? 0)).toBeLessThanOrEqual(12);
  }
});

it("shows the weeks in cards with chips of the people and a line per person", async () => {
  await open([entry("2026-W45", a(4, 3, 5), a(1, 2, 3))]);
  await screen.findByText(h.title);
  expect(screen.getAllByText(pl.checkin.results.you).length).toBeGreaterThan(1);
  expect(document.querySelectorAll("polyline")).toHaveLength(6);
});

it("says that the check-ins will appear when there are none", async () => {
  await open([]);
  await screen.findByText(h.empty);
  expect(screen.queryByText(h.title)).toBeNull();
});

it("shows an alert and keeps the card when the loading fails", async () => {
  const setup = await setupCheckin(true);
  vi.spyOn(setup.checkin, "history").mockRejectedValue(new Error("boom"));
  showCard(setup.platform);
  await press(h.show);
  expect((await screen.findByRole("alert")).textContent).toBe(h.failed);
  expect(screen.getAllByRole("radio")).toHaveLength(15);
});

it("loads again after a change of the sources", async () => {
  const setup = await setupCheckin(true);
  showCard(setup.platform);
  await press(h.show);
  await screen.findByText(h.empty);
  await act(() => setup.checkin.submit({ mood: 4, energy: 3, closeness: 5 }));
  await waitFor(() => {
    expect(screen.getByText(`${mood}: 4 z 5`)).toBeTruthy();
  });
});

const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${String((n >> 16) & 255)}, ${String((n >> 8) & 255)}, ${String(n & 255)})`;
};
