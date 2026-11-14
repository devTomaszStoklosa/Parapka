// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { pl } from "../i18n/pl";
import {
  cycleOf,
  saveForm,
  setup,
  show,
  useSodium,
} from "./cycle-screen-test-support";

useSodium();
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// The clock of the support is 2026-11-11, noon.
const period = (id: string, startDate: string) => ({
  id,
  startDate,
  endDate: null,
});

describe("the cycle screen", () => {
  it("asks for the start of the last period when there is none", async () => {
    const { platform } = await setup(false);
    show(platform);
    expect(await screen.findByText(pl.cycle.noForecast)).toBeTruthy();
    expect(screen.getAllByRole("heading")[0]?.textContent).toBe(
      pl.screens.cycle.title,
    );
    expect(screen.getByText("listopad 2026")).toBeTruthy();
    expect(screen.queryByText(pl.cycle.today)).toBeNull();
  });

  it("describes the forecast as an estimate and shows today's phase", async () => {
    const { platform } = await setup(false);
    await cycleOf(platform).savePeriod(period("a", "2026-11-09"));
    await saveForm(platform, "feminine");
    show(platform);
    expect(
      await screen.findByText(/^Następna miesiączka: około .*, szacunek/),
    ).toBeTruthy();
    expect(screen.getByText("Faza miesiączki (szacunek)")).toBeTruthy();
    expect(
      screen.getByText(
        "Możesz mieć mniej energii. Daj sobie więcej spokoju i odpoczynku.",
      ),
    ).toBeTruthy();
    expect(screen.getByText(pl.cycle.draft)).toBeTruthy();
    expect(screen.queryByText(pl.cycle.irregular)).toBeNull();
  });

  it("uses the neutral form without a profile", async () => {
    const { platform } = await setup(false);
    await cycleOf(platform).savePeriod(period("a", "2026-11-09"));
    show(platform);
    expect(
      await screen.findByText(
        "Może być mniej energii. Warto zostawić więcej spokoju i odpoczynku.",
      ),
    ).toBeTruthy();
  });

  it("says that the ranges are wider when the cycle is irregular", async () => {
    const { platform } = await setup(false);
    const cycle = cycleOf(platform);
    await cycle.savePeriod(period("a", "2026-05-01"));
    await cycle.savePeriod(period("b", "2026-05-25"));
    await cycle.savePeriod(period("c", "2026-07-10"));
    await cycle.savePeriod(period("d", "2026-08-05"));
    await cycle.savePeriod(period("e", "2026-10-20"));
    show(platform);
    expect(await screen.findByText(pl.cycle.irregular)).toBeTruthy();
  });

  it("shows the message of FR-CYC-15 with one touch, also without data", async () => {
    const { platform } = await setup(false);
    show(platform);
    const button = screen.getByRole("button", {
      name: pl.cycle.disclaimer.button,
    });
    expect(screen.queryByText(pl.onboarding.disclaimer.text)).toBeNull();
    fireEvent.click(button);
    expect(screen.getByText(pl.onboarding.disclaimer.text)).toBeTruthy();
    expect(pl.onboarding.disclaimer.text).toContain(
      "To nie jest metoda antykoncepcji ani narzędzie medyczne.",
    );
    fireEvent.click(button);
    expect(screen.queryByText(pl.onboarding.disclaimer.text)).toBeNull();
  });

  it("refreshes after a new entry", async () => {
    const { platform } = await setup(false);
    show(platform);
    await screen.findByText(pl.cycle.noForecast);
    await cycleOf(platform).savePeriod(period("a", "2026-11-09"));
    expect(await screen.findByText(/^Następna miesiączka: około/)).toBeTruthy();
    expect(screen.queryByText(pl.cycle.noForecast)).toBeNull();
  });

  it("refreshes after a change of the form", async () => {
    const { platform } = await setup(false);
    await cycleOf(platform).savePeriod(period("a", "2026-11-09"));
    show(platform);
    await screen.findByText(/^Może być mniej energii/);
    await saveForm(platform, "masculine");
    expect(await screen.findByText(/^Możesz mieć mniej energii/)).toBeTruthy();
  });

  it("does not fall over when the data cannot be loaded", async () => {
    const { platform } = await setup(false);
    vi.spyOn(cycleOf(platform), "periods").mockRejectedValue(new Error("x"));
    show(platform);
    expect(await screen.findByText(pl.cycle.failed)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: pl.cycle.disclaimer.button }),
    ).toBeTruthy();
  });

  it("saves a period with one touch and refreshes the calendar and the forecast", async () => {
    const { platform } = await setup(false);
    show(platform);
    await screen.findByText(pl.cycle.noForecast);
    fireEvent.click(
      screen.getByRole("button", { name: pl.cycle.period.startToday }),
    );
    expect(await screen.findByText(/^Następna miesiączka: około/)).toBeTruthy();
    expect(
      screen.getByLabelText("11 listopada: miesiączka, dziś"),
    ).toBeTruthy();
    expect(
      await screen.findByRole("button", { name: pl.cycle.period.endToday }),
    ).toBeTruthy();
  });

  it("opens the panel of a touched day and closes it after a save", async () => {
    const { platform } = await setup(false);
    show(platform);
    await screen.findByText(pl.cycle.noForecast);
    fireEvent.click(screen.getByLabelText("3 listopada"));
    fireEvent.click(
      screen.getByRole("button", { name: pl.cycle.period.startOnDay }),
    );
    expect(
      await screen.findByLabelText("3 listopada: miesiączka"),
    ).toBeTruthy();
    expect(screen.queryByText(pl.cycle.period.startOnDay)).toBeNull();
  });

  it("keeps the screen when saving fails", async () => {
    const { platform } = await setup(false);
    vi.spyOn(cycleOf(platform), "savePeriod").mockRejectedValue(new Error("x"));
    show(platform);
    await screen.findByText(pl.cycle.noForecast);
    fireEvent.click(
      screen.getByRole("button", { name: pl.cycle.period.startToday }),
    );
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("listopad 2026")).toBeTruthy();
  });
});
