import type { IsoWeek } from "@parapka/domain";
import type { ContentChange } from "@parapka/protocol";

import { base64Decode } from "../sync/base64";

export const SEALED_COLLECTION = "checkin-sealed";
export const SEALED_ENTITY = "CheckIn";

/** The highest version that the additional data of the seal can carry. */
export const MAX_VERSION = 0xffffffff;

const NONCE_LENGTH = 24;
const WEEK = /^\d{4}-W\d{2}$/;

/** One sealed version of a check-in; `sealKey` is set on the own ones only. */
export interface SealedRecord {
  checkinId: string;
  week: IsoWeek;
  authorId: string;
  version: number;
  nonce: string;
  ciphertext: string;
  own: boolean;
  sent: boolean;
  sealKey: string | null;
}

/** The check-in of one author in one week. */
export const checkinIdOf = (week: IsoWeek, authorId: string) =>
  `${week}:${authorId}`;

export const recordIdOf = (checkinId: string, version: number) =>
  `${checkinId}|${String(version)}`;

const isText = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const decodes = (value: unknown, length?: number) => {
  if (!isText(value)) return false;
  try {
    const bytes = base64Decode(value);
    return length === undefined || bytes.length === length;
  } catch {
    return false;
  }
};

const isWeek = (value: unknown): value is string =>
  typeof value === "string" && WEEK.test(value);

const isVersion = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= MAX_VERSION;

type Header = Pick<SealedRecord, "checkinId" | "week" | "authorId" | "version">;

/** The fields that name the version, or null when they do not agree. */
function headerOf(
  value: (name: string) => unknown,
  id: string,
  partnerId: string | null,
): Header | null {
  const checkinId = value("checkinId");
  const week = value("week");
  const authorId = value("authorId");
  const version = value("version");
  if (!isWeek(week) || !isText(authorId) || !isVersion(version)) return null;
  const bound =
    partnerId !== null &&
    authorId === partnerId &&
    checkinId === checkinIdOf(week, authorId) &&
    id === recordIdOf(checkinId, version);
  return bound ? { checkinId, week, authorId, version } : null;
}

/** The sealed version of a change of the partner, or null when it is invalid or not his. */
export function parseSealed(
  change: ContentChange,
  partnerId: string | null,
): SealedRecord | null {
  if (change.op !== "upsert") return null;
  const value = (name: string) =>
    Object.hasOwn(change.fields, name) ? change.fields[name]?.value : undefined;
  const header = headerOf(value, change.id, partnerId);
  const nonce = value("nonce");
  const ciphertext = value("ciphertext");
  if (header === null) return null;
  if (!decodes(nonce, NONCE_LENGTH) || !decodes(ciphertext)) return null;
  return {
    ...header,
    nonce: nonce as string,
    ciphertext: ciphertext as string,
    own: false,
    sent: true,
    sealKey: null,
  };
}
