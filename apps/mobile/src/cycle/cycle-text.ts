import type { CalendarDate, CycleForecast } from "@parapka/domain";

import { t, type TranslationKey } from "../i18n";
import type { CalendarDay } from "./calendar-model";

const monthOf = (month: number) =>
  t(`cycle.monthsOf.${String(month)}` as TranslationKey);

/** "29 listopada": the day and the month of an ISO date, without the year. */
export function dateText(date: CalendarDate): string {
  return t("cycle.calendar.day.date", {
    day: Number(date.slice(8, 10)),
    month: monthOf(Number(date.slice(5, 7))),
  });
}

/** The sentence about the next period: always an estimate (FR-CYC-02). */
export function forecastText(forecast: CycleForecast): string {
  return t("cycle.forecast", {
    date: dateText(forecast.nextStart),
    from: dateText(forecast.rangeStart),
    to: dateText(forecast.rangeEnd),
    note: forecast.confidence === "low" ? t("cycle.lowConfidence") : "",
  });
}

/** What a screen reader says about a day: the date and what the data says. */
export function dayLabel(day: CalendarDay): string {
  const states: TranslationKey[] = [];
  if (day.isPeriod) states.push("cycle.calendar.day.period");
  if (day.isNextStart) states.push("cycle.calendar.day.next");
  else if (day.inForecastRange) states.push("cycle.calendar.day.range");
  if (day.isToday) states.push("cycle.calendar.day.today");
  const date = dateText(day.date);
  return states.length === 0
    ? date
    : `${date}: ${states.map((key) => t(key)).join(", ")}`;
}
