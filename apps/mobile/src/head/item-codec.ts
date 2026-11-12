import {
  MENTAL_LOAD_CATEGORIES,
  validateChoreTitle,
} from "@parapka/domain";

export type ItemField =
  | "title"
  | "category"
  | "weight"
  | "dueDate"
  | "status"
  | "doneAt";

const DUE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isItemField = (name: string): name is ItemField =>
  name === "title" ||
  name === "category" ||
  name === "weight" ||
  name === "dueDate" ||
  name === "status" ||
  name === "doneAt";

/** A due date as stored: null (none) or an existing day, `YYYY-MM-DD`. */
export function isValidDueDate(value: unknown): value is string | null {
  if (value === null) return true;
  const match = typeof value === "string" ? DUE_DATE.exec(value) : null;
  if (match === null) return false;
  const [year, month, day] = match.slice(1).map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === value;
}

const isTitle = (value: unknown) => {
  if (typeof value !== "string") return false;
  try {
    validateChoreTitle(value);
    return true;
  } catch {
    return false;
  }
};

const isDoneAt = (value: unknown) =>
  value === null ||
  (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);

const CHECKS: Record<ItemField, (value: unknown) => boolean> = {
  title: isTitle,
  category: (value) =>
    (MENTAL_LOAD_CATEGORIES as readonly unknown[]).includes(value),
  weight: (value) => value === 1 || value === 2 || value === 3,
  dueDate: isValidDueDate,
  status: (value) => value === "open" || value === "done",
  doneAt: isDoneAt,
};

/** True when a value that came from the partner may be kept as the field. */
export const isValidField = (name: ItemField, value: unknown): boolean =>
  CHECKS[name](value);
