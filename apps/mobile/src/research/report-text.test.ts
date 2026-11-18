import { expect, it } from "vitest";

import forbidden from "../../../../content/forbidden-phrases.json";
import {
  findPhrases,
  parseForbiddenLists,
} from "../../../../packages/content/src/forbidden";
import { pl } from "../i18n/pl";
import { buildReportText, reportRows } from "./report-text";
import type { ResearchReport } from "./research-report";

const empty: ResearchReport = {
  reportVersion: 1,
  weeksSincePairing: null,
  activeDaysWeek4: null,
  checkinRevealRate: null,
  hintFeedback: null,
  mentalLoadWeek1: null,
  mentalLoadWeek6: null,
};

const full: ResearchReport = {
  reportVersion: 1,
  weeksSincePairing: 6,
  activeDaysWeek4: 5,
  checkinRevealRate: 0.5,
  hintFeedback: { count: 3, accurateAvg: 4.2, notPushyAvg: 4.5 },
  mentalLoadWeek1: { me: 0.7, partner: 0.3 },
  mentalLoadWeek6: { me: 0.55, partner: 0.45 },
};

it("writes the no-data label for every null", () => {
  const values = reportRows(empty).map(({ value }) => value);
  expect(values).toEqual(Array<string>(8).fill(pl.research.noData));
});

it("writes the numbers with their labels", () => {
  const rows = reportRows(full);
  expect(rows[0]).toEqual({
    label: pl.research.labels.weeksSincePairing,
    value: "6",
  });
  expect(rows[4]?.value).toBe("4.2");
  expect(rows[7]?.value).toBe("0.55 / 0.45");
});

it("puts the same object in the JSON block", () => {
  const text = buildReportText(full);
  const json = text.slice(text.indexOf("{"));
  expect(JSON.parse(json)).toEqual(full);
  expect(text).toContain(`${pl.research.version}: 1`);
});

it("has only numbers and labels: no dates, no revealing phrases", () => {
  const { revealing } = parseForbiddenLists(forbidden);
  for (const report of [empty, full]) {
    const text = buildReportText(report);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(findPhrases(text, [...revealing])).toEqual([]);
  }
  expect(findPhrases(JSON.stringify(pl.research), [...revealing])).toEqual([]);
});
