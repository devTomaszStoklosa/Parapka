// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { pl } from "../i18n/pl";
import { CycleCalendar } from "./CycleCalendar";

afterEach(cleanup);

const forecast = {
  nextStart: "2026-11-29",
  rangeStart: "2026-11-27",
  rangeEnd: "2026-12-01",
  cycleLength: 28,
  cycleLengthSource: "history",
  confidence: "normal",
  isEstimate: true,
} as const;

const show = (
  withForecast: boolean,
  today = "2026-11-14",
  onSelect: (date: string) => void = vi.fn(),
  selected: string | null = null,
) =>
  render(
    <CycleCalendar
      periods={[{ id: "a", startDate: "2026-11-01", endDate: "2026-11-05" }]}
      periodLength={5}
      forecast={withForecast ? forecast : null}
      today={today}
      selected={selected}
      onSelect={onSelect}
    />,
  );

const press = (name: string) => {
  fireEvent.click(screen.getByRole("button", { name }));
};

it("shows the current month with the states of the days", () => {
  show(true);
  expect(screen.getByText("listopad 2026")).toBeTruthy();
  expect(screen.getByLabelText("14 listopada: dziś")).toBeTruthy();
  expect(screen.getByLabelText("3 listopada: miesiączka")).toBeTruthy();
  expect(
    screen.getByLabelText("28 listopada: prognoza miesiączki (szacunek)"),
  ).toBeTruthy();
  expect(
    screen.getByLabelText(
      "29 listopada: najbardziej prawdopodobny początek miesiączki (szacunek)",
    ),
  ).toBeTruthy();
  expect(screen.getByLabelText("20 listopada")).toBeTruthy();
});

it("marks today in the cell, beside the state mark", () => {
  show(true);
  expect(screen.getByLabelText("14 listopada: dziś").textContent).toContain(
    "•",
  );
  show(true, "2026-11-03");
  expect(
    screen.getAllByLabelText(/^3 listopada/).at(-1)?.textContent,
  ).toContain("•●");
});

it("tells every state in words in the legend", () => {
  show(true);
  for (const text of Object.values(pl.cycle.calendar.legend)) {
    expect(
      screen.getAllByText((content) => content.endsWith(" " + text)),
    ).toHaveLength(1);
  }
});

it("shows no forecast marks without a forecast", () => {
  show(false);
  expect(screen.getByLabelText("28 listopada")).toBeTruthy();
});

it("keeps the month name on its own line above the labelled buttons", () => {
  show(true);
  const name = screen.getByRole("heading", { name: "listopad 2026" });
  const previous = screen.getByRole("button", {
    name: pl.cycle.calendar.previous,
  });
  expect(previous.textContent).toBe("‹");
  expect(
    screen.getByRole("button", { name: pl.cycle.calendar.next }).textContent,
  ).toBe("›");
  expect(
    name.compareDocumentPosition(previous) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it("scrolls over the end of the year in both directions", () => {
  show(true, "2026-12-10");
  expect(screen.getByText("grudzień 2026")).toBeTruthy();
  expect(
    screen.getByLabelText("1 grudnia: prognoza miesiączki (szacunek)"),
  ).toBeTruthy();
  press(pl.cycle.calendar.next);
  expect(screen.getByText("styczeń 2027")).toBeTruthy();
  press(pl.cycle.calendar.previous);
  press(pl.cycle.calendar.previous);
  expect(screen.getByText("listopad 2026")).toBeTruthy();
  for (let i = 0; i < 11; i += 1) press(pl.cycle.calendar.previous);
  expect(screen.getByText("grudzień 2025")).toBeTruthy();
});

it("makes every day a button that tells its date when touched", () => {
  const onSelect = vi.fn();
  show(true, "2026-11-14", onSelect);
  fireEvent.click(
    screen.getByRole("button", { name: "3 listopada: miesiączka" }),
  );
  expect(onSelect).toHaveBeenCalledWith("2026-11-03");
  expect(screen.getAllByRole("button").length).toBeGreaterThan(30);
});

it("tells which day is selected", () => {
  show(true, "2026-11-14", vi.fn(), "2026-11-20");
  expect(
    screen
      .getByRole("button", { name: "20 listopada" })
      .getAttribute("aria-selected"),
  ).toBe("true");
});
