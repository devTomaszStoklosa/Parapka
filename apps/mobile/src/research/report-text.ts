import { t } from "../i18n";
import type { ResearchReport } from "./research-report";

export interface ReportRow {
  label: string;
  /** The number, or "brak danych" for null. */
  value: string;
}

const show = (value: number | null) =>
  value === null ? t("research.noData") : String(value);

const split = (value: ResearchReport["mentalLoadWeek1"]) =>
  value === null
    ? t("research.noData")
    : `${String(value.me)} / ${String(value.partner)}`;

/** The labelled numbers of the report, for the preview and for the text. */
export function reportRows(report: ResearchReport): ReportRow[] {
  const feedback = report.hintFeedback;
  return [
    {
      label: t("research.labels.weeksSincePairing"),
      value: show(report.weeksSincePairing),
    },
    {
      label: t("research.labels.activeDaysWeek4"),
      value: show(report.activeDaysWeek4),
    },
    {
      label: t("research.labels.checkinRevealRate"),
      value: show(report.checkinRevealRate),
    },
    {
      label: t("research.labels.hintFeedbackCount"),
      value: show(feedback?.count ?? null),
    },
    {
      label: t("research.labels.hintFeedbackAccurate"),
      value: show(feedback?.accurateAvg ?? null),
    },
    {
      label: t("research.labels.hintFeedbackNotPushy"),
      value: show(feedback?.notPushyAvg ?? null),
    },
    {
      label: t("research.labels.mentalLoadWeek1"),
      value: split(report.mentalLoadWeek1),
    },
    {
      label: t("research.labels.mentalLoadWeek6"),
      value: split(report.mentalLoadWeek6),
    },
  ];
}

/** The text to share: readable lines, then the JSON of the same object. */
export function buildReportText(report: ResearchReport): string {
  const lines = reportRows(report).map(
    ({ label, value }) => `${label}: ${value}`,
  );
  return [
    t("research.header"),
    `${t("research.version")}: ${String(report.reportVersion)}`,
    ...lines,
    "",
    JSON.stringify(report, null, 2),
  ].join("\n");
}
