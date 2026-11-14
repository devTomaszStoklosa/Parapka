import type { CycleForecast } from "@parapka/domain";
import { expect, it } from "vitest";

import type { CalendarDay } from "./calendar-model";
import { dateText, dayLabel, forecastText } from "./cycle-text";

const forecast: CycleForecast = {
  nextStart: "2026-11-29",
  rangeStart: "2026-11-27",
  rangeEnd: "2026-12-01",
  cycleLength: 28,
  cycleLengthSource: "history",
  confidence: "normal",
  isEstimate: true,
};

const day = (extra: Partial<CalendarDay>): CalendarDay => ({
  date: "2026-11-29",
  isPeriod: false,
  inForecastRange: false,
  isNextStart: false,
  isToday: false,
  ...extra,
});

it("writes a date in Polish without the year", () => {
  expect(dateText("2026-12-01")).toBe("1 grudnia");
});

it("describes the forecast as an estimate with a range across months", () => {
  expect(forecastText(forecast)).toBe(
    "Następna miesiączka: około 29 listopada (27 listopada – 1 grudnia), szacunek",
  );
});

it("adds the note about low confidence", () => {
  expect(forecastText({ ...forecast, confidence: "low" })).toBe(
    "Następna miesiączka: około 29 listopada (27 listopada – 1 grudnia), szacunek, mała pewność",
  );
});

it("labels the days by what the data says", () => {
  expect(dayLabel(day({}))).toBe("29 listopada");
  expect(dayLabel(day({ inForecastRange: true }))).toBe(
    "29 listopada: prognoza miesiączki (szacunek)",
  );
  expect(dayLabel(day({ inForecastRange: true, isNextStart: true }))).toBe(
    "29 listopada: najbardziej prawdopodobny początek miesiączki (szacunek)",
  );
  expect(dayLabel(day({ isPeriod: true, isToday: true }))).toBe(
    "29 listopada: miesiączka, dziś",
  );
});
