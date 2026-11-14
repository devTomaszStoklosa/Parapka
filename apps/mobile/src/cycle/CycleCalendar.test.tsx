// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

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

const show = (withForecast: boolean, today = "2026-11-14") =>
  render(
    <CycleCalendar
      periods={[{ id: "a", startDate: "2026-11-01", endDate: "2026-11-05" }]}
      periodLength={5}
      forecast={withForecast ? forecast : null}
      today={today}
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
