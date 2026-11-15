// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { pl } from "../i18n/pl";
import {
  cycleOf,
  saveForm,
  setup,
  show,
  useSodium,
} from "./cycle-screen-test-support";
import { HINT_FEEDBACK } from "./hint-feedback-repository";
import { wireHintFeedback } from "./wiring";

useSodium();
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// The clock of the support is 2026-11-11; the first hint is 14 days older.
const DAY = 24 * 60 * 60 * 1000;
const SINCE = "2026-10-28";
const title = () => screen.queryByText(pl.cycle.feedback.title);
const card = () =>
  within(screen.getByRole("group", { name: pl.cycle.feedback.title }));
const save = () => card().getByRole("button", { name: pl.cycle.feedback.save });

async function due(options: { cycle?: boolean } = {}) {
  const set = await setup(false);
  cycleOf(set.platform);
  if (options.cycle !== false) await saveForm(set.platform, "neutral");
  await wireHintFeedback(set.platform).noteFirstHint(SINCE);
  return set;
}

it("is not shown without a first hint or before the 14th day", async () => {
  const { platform } = await setup(false);
  await saveForm(platform, "neutral");
  show(platform);
  expect(await screen.findByText(pl.cycle.noForecast)).toBeTruthy();
  expect(title()).toBeNull();
  cleanup();
  await wireHintFeedback(platform).noteFirstHint("2026-10-29");
  show(platform);
  expect(await screen.findByText(pl.cycle.noForecast)).toBeTruthy();
  expect(title()).toBeNull();
});

it("is not shown when the panel is off", async () => {
  const { platform } = await due({ cycle: false });
  show(platform);
  expect(await screen.findByText(pl.cycle.noForecast)).toBeTruthy();
  expect(title()).toBeNull();
});

it("saves the answer after both ratings and disappears", async () => {
  const { platform } = await due();
  show(platform);
  expect(await screen.findByText(pl.cycle.feedback.title)).toBeTruthy();
  const radio = (question: string, value: number) =>
    card().getByRole("radio", {
      name: pl.cycle.feedback.rating
        .replace("{question}", question)
        .replace("{value}", String(value)),
    });
  expect(
    screen.getByRole("radiogroup", { name: pl.cycle.feedback.accurateName }),
  ).toBeTruthy();
  fireEvent.click(save());
  fireEvent.click(radio(pl.cycle.feedback.accurateName, 4));
  expect(save().hasAttribute("disabled")).toBe(true);
  fireEvent.click(radio(pl.cycle.feedback.notPushyName, 2));
  expect(save().hasAttribute("disabled")).toBe(false);
  fireEvent.click(save());
  await vi.waitFor(() => {
    expect(title()).toBeNull();
  });
  expect(
    await platform.database.get(HINT_FEEDBACK, "entry-2026-11-11"),
  ).toEqual({
    date: "2026-11-11",
    period: "2026-10-29/2026-11-11",
    accurate: 4,
    notPushy: 2,
  });
});

it("closes without an answer and comes back after 14 days, not before", async () => {
  const { platform, time } = await due();
  show(platform);
  fireEvent.click(
    await screen.findByRole("button", { name: pl.cycle.feedback.close }),
  );
  await vi.waitFor(() => {
    expect(title()).toBeNull();
  });
  expect(
    await platform.database.get(HINT_FEEDBACK, "entry-2026-11-11"),
  ).toEqual({ date: "2026-11-11", closed: true });
  cleanup();

  time.now += 6 * DAY;
  show(platform);
  expect(await screen.findByText(pl.cycle.noForecast)).toBeTruthy();
  expect(title()).toBeNull();
  cleanup();

  time.now += 8 * DAY;
  show(platform);
  expect(await screen.findByText(pl.cycle.feedback.title)).toBeTruthy();
});

it("says so when the answer is not saved", async () => {
  const { platform } = await due();
  vi.spyOn(platform.database, "put").mockRejectedValueOnce(new Error("disk"));
  show(platform);
  fireEvent.click(
    await screen.findByRole("button", { name: pl.cycle.feedback.close }),
  );
  expect(await screen.findByText(pl.cycle.feedback.error)).toBeTruthy();
  expect(title()).toBeTruthy();
});
