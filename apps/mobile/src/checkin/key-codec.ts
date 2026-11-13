import type { ContentChange } from "@parapka/protocol";

import { base64Decode } from "../sync/base64";
import { MAX_VERSION, changeHlc, recordIdOf } from "./sealed-codec";

export const KEY_COLLECTION = "checkin-keys";
export const KEY_ENTITY = "CheckInKey";

const KEY_LENGTH = 32;
const CHECKIN_ID = /^\d{4}-W\d{2}:(.+)$/;

/** The key of one sealed version; the own ones wait to be sent. */
export interface KeyRecord {
  checkinId: string;
  version: number;
  key: string;
  own: boolean;
  sent: boolean;
  hlc?: string;
}

const decodesKey = (value: unknown) => {
  if (typeof value !== "string") return false;
  try {
    return base64Decode(value).length === KEY_LENGTH;
  } catch {
    return false;
  }
};

const isVersion = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= MAX_VERSION;

/** The key of a change of the partner, or null when it is invalid or not his. */
export function parseKey(
  change: ContentChange,
  partnerId: string | null,
): KeyRecord | null {
  if (change.op !== "upsert") return null;
  const value = (name: string) =>
    Object.hasOwn(change.fields, name) ? change.fields[name]?.value : undefined;
  const checkinId = value("checkinId");
  const version = value("version");
  const key = value("key");
  if (typeof checkinId !== "string" || !isVersion(version)) return null;
  const author = CHECKIN_ID.exec(checkinId)?.[1];
  const bound =
    decodesKey(key) &&
    author !== undefined &&
    partnerId !== null &&
    author === partnerId &&
    change.id === recordIdOf(checkinId, version);
  return bound
    ? {
        checkinId,
        version,
        key: key as string,
        own: false,
        sent: true,
        hlc: changeHlc(change),
      }
    : null;
}
