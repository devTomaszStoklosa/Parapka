import { t } from "../i18n";

/** The three questions of the check-in, in the order every view shows them. */
export const QUESTIONS = [
  { key: "mood", label: "checkin.form.mood" },
  { key: "energy", label: "checkin.form.energy" },
  { key: "closeness", label: "checkin.results.closeness" },
] as const;

/** "4 z 5": one answer on the scale. */
export const valueText = (rating: number) =>
  t("checkin.results.value", { value: rating });
