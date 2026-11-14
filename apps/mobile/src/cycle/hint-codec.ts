import type { CalendarDate, HintCategory } from "@parapka/domain";
import type { ContentChange } from "@parapka/protocol";
import type { Change } from "@parapka/sync";

import type { NextHlc } from "../sync/handler-registry";

/** The entity of a hint in the state, in the envelope and in the merge. */
export const ENTITY = "Hint";
export const MAX_TEXT_LENGTH = 120;

export const CATEGORIES: readonly HintCategory[] = [
  "relief",
  "tenderness",
  "attention",
  "space",
  "appreciation",
];
export const STATUSES = ["scheduled", "skipped", "replaced"] as const;
export type HintStatus = (typeof STATUSES)[number];

/**
 * The only fields of a hint that leave the phone (FR-CYC-09): the text, its
 * category, the day and the status. The template and the content version stay.
 */
export interface SentHint {
  readonly forDate: CalendarDate;
  readonly text: string;
  readonly category: HintCategory;
  readonly status: HintStatus;
}

export interface Pending {
  fields: SentHint | null;
  life: "delete" | "restore" | null;
}

const FIELDS = ["forDate", "text", "category", "status"];

/** True when a value may be kept as the field. */
export function isValidField(name: string, value: unknown): boolean {
  switch (name) {
    case "forDate":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
    case "text":
      return (
        typeof value === "string" &&
        value.trim() !== "" &&
        value.length <= MAX_TEXT_LENGTH
      );
    case "category":
      return CATEGORIES.includes(value as HintCategory);
    default:
      return name === "status" && STATUSES.includes(value as HintStatus);
  }
}

/** The values of the fields when all four are valid, else null. */
export function validHint(values: Record<string, unknown>): SentHint | null {
  return FIELDS.every((name) => isValidField(name, values[name]))
    ? (Object.fromEntries(
        FIELDS.map((name) => [name, values[name]]),
      ) as unknown as SentHint)
    : null;
}

export function stampPending(
  id: string,
  { fields, life }: Pending,
  nextHlc: NextHlc,
): ContentChange[] {
  const changes: ContentChange[] = [];
  if (fields !== null) {
    const stamped: Record<string, { value: unknown; hlc: string }> = {};
    for (const name of FIELDS) {
      stamped[name] = {
        value: fields[name as keyof SentHint],
        hlc: nextHlc(),
      };
    }
    changes.push({ entity: ENTITY, id, op: "upsert", fields: stamped });
  }
  if (life !== null) {
    changes.push({ entity: ENTITY, id, op: life, hlc: nextHlc() });
  }
  return changes;
}

/** Drops from pending what a collected change took over. */
export function settle(pending: Pending, change: ContentChange): void {
  if (change.op === "upsert") {
    pending.fields = null;
  } else if (pending.life === change.op) {
    pending.life = null;
  }
}

export const toMerge = (change: ContentChange) => change as Change;

/**
 * The change of the partner: only an upsert with all four valid fields; other
 * fields are dropped, so nothing else is ever saved.
 */
export function sanitize(change: ContentChange): Change | null {
  if (change.op !== "upsert") return null;
  const values = Object.fromEntries(
    FIELDS.map((name) => [name, change.fields[name]?.value]),
  );
  if (validHint(values) === null) return null;
  const fields = Object.fromEntries(
    Object.entries(change.fields).filter(([name]) => FIELDS.includes(name)),
  );
  return toMerge({ ...change, fields });
}
