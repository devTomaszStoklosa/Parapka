import { CHORE_TITLE_MAX_LENGTH, type MentalLoadWeight } from "@parapka/domain";

import { t, type TranslationKey } from "../i18n";
import { formatDate, localDate } from "../chores/planner-model";
import type { HeadItem } from "./head-service";
import { isValidDueDate } from "./item-codec";

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

/** The done items, the latest closed first. */
export function archivedItems(items: readonly HeadItem[]): HeadItem[] {
  const closed = (item: HeadItem) => item.doneAt ?? 0;
  return items
    .filter((item) => item.status === "done")
    .sort((a, b) => closed(b) - closed(a) || compare(b.id, a.id));
}

/** "I take it" is offered for an open, shared item of the partner or of both. */
export const canTakeOver = (item: HeadItem, paired: boolean) =>
  paired &&
  item.status === "open" &&
  item.shared &&
  (item.carrier === "partner" || item.carrier === "both");

/** "Please take it over" is offered for an open, shared item that I carry. */
export const canRequestHandover = (item: HeadItem, paired: boolean) =>
  paired &&
  item.status === "open" &&
  item.shared &&
  (item.carrier === "me" || item.carrier === "both");

/** The details of an archived row: the category and the day it was closed. */
export const archiveLines = (item: HeadItem) => [
  t(`head.categories.${item.category}`),
  ...(item.doneAt === null
    ? []
    : [t("head.archive.closed", { date: formatDate(localDate(item.doneAt)) })]),
];

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
const isDueDate = (date: string) => date === "" || isValidDueDate(date);

/** The error of the form, or null when the title and the due date are fine. */
export function formError(form: AddForm): TranslationKey | null {
  if (form.title.trim().length === 0) return "head.add.errors.titleEmpty";
  if (Array.from(form.title).length > CHORE_TITLE_MAX_LENGTH) {
    return "head.add.errors.titleTooLong";
  }
  return isDueDate(form.dueDate.trim()) ? null : "head.add.errors.dueDate";
}
