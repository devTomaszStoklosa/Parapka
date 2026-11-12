import { CHORE_TITLE_MAX_LENGTH, type MentalLoadWeight } from "@parapka/domain";

import { t, type TranslationKey } from "../i18n";
import { formatDate } from "../chores/planner-model";
import type { HeadItem } from "./head-service";

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The open items: those with a due date (the nearest first), then the newest. */
export function openItems(items: readonly HeadItem[]): HeadItem[] {
  // The ids rise with time (UUIDv7), so the newest has the greatest id.
  const newest = (a: HeadItem, b: HeadItem) => compare(b.id, a.id);
  const open = items.filter((item) => item.status === "open");
  const due = (item: HeadItem) => item.dueDate ?? "";
  const dated = open
    .filter((item) => item.dueDate !== null)
    .sort((a, b) => compare(due(a), due(b)) || newest(a, b));
  const rest = open.filter((item) => item.dueDate === null).sort(newest);
  return [...dated, ...rest];
}

const WEIGHT_KEYS = {
  1: "head.weights.1",
  2: "head.weights.2",
  3: "head.weights.3",
} as const;

export const weightText = (weight: MentalLoadWeight) => t(WEIGHT_KEYS[weight]);

/** Who carries the item; the name of the partner when it is known. */
export function carrierText(
  carrier: HeadItem["carrier"],
  partnerName: string | null,
) {
  if (carrier === null) return t("head.carriers.none");
  if (carrier === "partner" && partnerName !== null) return partnerName;
  return t(`head.carriers.${carrier}`);
}

/** The details of a row under the title; the same go to the accessibility label. */
export function detailLines(item: HeadItem, partnerName: string | null) {
  return [
    t(`head.categories.${item.category}`),
    weightText(item.weight),
    carrierText(item.carrier, partnerName),
    ...(item.dueDate === null
      ? []
      : [t("head.due", { date: formatDate(item.dueDate) })]),
  ];
}

/** What the quick add form holds. */
export interface AddForm {
  readonly title: string;
  readonly dueDate: string;
}

/** An empty text, or a real calendar day as `YYYY-MM-DD`. */
function isDueDate(date: string) {
  if (date === "") return true;
  const time = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(date) : NaN;
  return (
    !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === date
  );
}

/** The error of the form, or null when the title and the due date are fine. */
export function formError(form: AddForm): TranslationKey | null {
  if (form.title.trim().length === 0) return "head.add.errors.titleEmpty";
  if (Array.from(form.title).length > CHORE_TITLE_MAX_LENGTH) {
    return "head.add.errors.titleTooLong";
  }
  return isDueDate(form.dueDate.trim()) ? null : "head.add.errors.dueDate";
}
