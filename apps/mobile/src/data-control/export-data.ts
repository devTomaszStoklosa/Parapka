import type { Clock } from "@parapka/domain";

import type { JsonValue, LocalDatabase } from "../data/local-database";
import { ACTIVITY_LOG } from "../research/activity-log";
import {
  momentOf,
  personalAssignment,
  personOf,
  pick,
  plainValues,
  syncedRows,
  type Devices,
} from "./export-sections";

export const EXPORT_FORMAT = "parapka-export";
export const EXPORT_VERSION = 1;

interface Source {
  readonly database: LocalDatabase;
  readonly devices: Devices;
}

interface Exported {
  /** The name of the section in the document. */
  readonly section: string;
  /** Why the collection belongs to the document. */
  readonly why: string;
  readonly build: (source: Source) => Promise<JsonValue>;
}

const one = ({ database }: Source, collection: string, id: string) =>
  database.get(collection, id);

const rowsOf = async (
  { database }: Source,
  collection: string,
  map: (id: string, values: Record<string, unknown>) => JsonValue | undefined,
) =>
  (await syncedRows(database, collection)).flatMap(({ id, values }) => {
    const mapped = map(id, values);
    return mapped === undefined ? [] : [mapped];
  });

/**
 * The collections that go into the document: the own data of the person and
 * the shared ones. Every field is picked by name, so a new field of a record
 * stays out until someone decides it belongs here.
 */
const EXPORTED: Record<string, Exported> = {
  profile: {
    section: "profile",
    why: "the own profile of the onboarding",
    build: (source) => one(source, "profile", "me"),
  },
  chores: {
    section: "chores",
    why: "all chores, private and shared, also those made by the partner",
    build: (source) =>
      rowsOf(source, "chores", (id, values) => ({
        id,
        ...pick(values, ["title", "rule", "note", "reminder", "linkedItemId"]),
        assignment: personalAssignment(values.assignment, source.devices),
      })),
  },
  "chore-completions": {
    section: "choreCompletions",
    why: "the check-offs of the chores, of both people",
    build: (source) =>
      rowsOf(source, "chore-completions", (_id, values) => {
        const completedAt = momentOf(values.completedAt);
        // Like the repository: a partial record from the partner stays out.
        if (typeof values.completedBy !== "string" || completedAt === null) {
          return undefined;
        }
        return {
          ...pick(values, ["choreId", "occurrenceDate"]),
          completedBy: personOf(values.completedBy, source.devices),
          completedAt,
        };
      }),
  },
  "mental-load-items": {
    section: "mentalLoadItems",
    why: "the things to remember, private and shared",
    build: (source) =>
      rowsOf(source, "mental-load-items", (id, values) => ({
        id,
        ...pick(values, [
          "title",
          "category",
          "weight",
          "dueDate",
          "status",
          "doneAt",
          "linkedChoreId",
        ]),
      })),
  },
  "carrier-changes": {
    section: "carrierChanges",
    why: "the history of who carries a thing to remember",
    build: (source) =>
      rowsOf(source, "carrier-changes", (_id, values) => ({
        itemId: values.itemId as string,
        carrier:
          values.carrier === "both"
            ? "both"
            : personOf(String(values.carrier), source.devices),
        changedBy: personOf(String(values.changedBy), source.devices),
        changedAt: momentOf(values.changedAt),
      })),
  },
  "handover-requests": {
    section: "handoverRequests",
    why: "the handover of things to remember: each state of each request",
    build: (source) =>
      rowsOf(source, "handover-requests", (_id, values) => ({
        ...pick(values, ["requestId", "itemId", "status"]),
        requestedBy: personOf(String(values.requestedBy), source.devices),
        changedAt: momentOf(values.changedAt),
      })),
  },
  "checkin-own": {
    section: "checkinAnswers",
    why: "the own answers of the check-ins; the ones of the partner are not here",
    build: ({ database }) => plainValues(database, "checkin-own"),
  },
  "couple-settings": {
    section: "checkinSchedule",
    why: "the shared schedule of the check-in",
    build: async (source) => {
      const [row] = await syncedRows(source.database, "couple-settings");
      return row === undefined
        ? null
        : pick(row.values, ["checkInDay", "checkInTime"]);
    },
  },
  "cycle-settings": {
    section: "cycleSettings",
    why: "the own cycle settings",
    build: (source) => one(source, "cycle-settings", "me"),
  },
  "period-logs": {
    section: "periodLogs",
    why: "the own period entries",
    build: ({ database }) => plainValues(database, "period-logs"),
  },
  "wellbeing-entries": {
    section: "wellbeingEntries",
    why: "the own wellbeing entries",
    build: ({ database }) => plainValues(database, "wellbeing-entries"),
  },
  "cycle-hints": {
    section: "ownHints",
    why: "the hints that this person's app made for the partner",
    build: (source) =>
      rowsOf(source, "cycle-hints", (id, values) => ({
        id,
        ...pick(values, ["forDate", "text", "category", "status"]),
      })),
  },
  "hint-feedback": {
    section: "hintSurvey",
    why: "the own answers of the survey on the hints",
    build: async ({ database }) =>
      (await database.list("hint-feedback")).map(({ id, value }) => ({
        id,
        ...(value as Record<string, JsonValue>),
      })),
  },
  "hint-reactions": {
    section: "hintReactions",
    why: "the own reactions to the hints; the text of the hints stays out",
    build: async ({ database }) =>
      (await database.list("hint-reactions")).map(({ id, value }) => ({
        hintId: id,
        ...(value as Record<string, JsonValue>),
      })),
  },
  consent: {
    section: "consent",
    why: "the date and the version of the consent",
    build: (source) => one(source, "consent", "current"),
  },
  "notification-settings": {
    section: "notificationSettings",
    why: "the own settings of the notifications",
    build: (source) => one(source, "notification-settings", "me"),
  },
  [ACTIVITY_LOG]: {
    section: "activityLog",
    why: "the days on which the app was opened, kept for the research report",
    build: async ({ database }) =>
      (await database.list(ACTIVITY_LOG)).map(({ value }) =>
        pick(value as Record<string, unknown>, ["date"]),
      ),
  },
};

const SECRET = "keys or secrets of the pairing, never exported";
const TECHNICAL = "technical state of the app, not data of the person";
const FROM_PARTNER = "data of the partner, not of this person";

/**
 * The collections that stay out, with the reason. A collection that is neither
 * here nor in `EXPORTED` fails the test of completeness.
 */
const SKIPPED: Record<string, string> = {
  "cycle-hints-received": FROM_PARTNER,
  "partner-profile": FROM_PARTNER,
  // The answers of the partner are inside; the own ones are in `checkin-own`.
  "checkin-revealed": FROM_PARTNER,
  "checkin-sealed": FROM_PARTNER,
  identity: "device id and public keys",
  lock: "hash and salt of the PIN",
  pair: "mailbox id of the pair and public keys of the partner",
  "checkin-keys": SECRET,
  "share-private": TECHNICAL,
  "dump-offer": TECHNICAL,
  "pair-closing": TECHNICAL,
  "pair-disconnect": TECHNICAL,
  "hint-withdrawal": TECHNICAL,
  "checkin-withdrawal": TECHNICAL,
  "sync-pause": TECHNICAL,
  // Holds the goals of the partner that wait for the consent (`held-goals`).
  "sync-profile": FROM_PARTNER,
  "sync-outbox": TECHNICAL,
  "sync-applied": TECHNICAL,
  "sync-errors": TECHNICAL,
  "sync-held": TECHNICAL,
  "sync-state": TECHNICAL,
  hlc: TECHNICAL,
  "notification-watch": TECHNICAL,
  "notifications-delivered": TECHNICAL,
  "notifications-queue": TECHNICAL,
  meta: TECHNICAL,
  "schema-version": TECHNICAL,
};

export const EXPORTED_COLLECTIONS = Object.keys(EXPORTED);
export const SKIPPED_COLLECTIONS = Object.keys(SKIPPED);

export type ExportDocument = {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
} & Record<string, JsonValue>;

async function devicesOf(database: LocalDatabase): Promise<Devices> {
  const identity = (await database.get("identity", "device")) as {
    deviceId?: string | null;
  } | null;
  const pair = (await database.get("pair", "current")) as {
    deviceId?: string | null;
  } | null;
  return { own: identity?.deviceId ?? null, partner: pair?.deviceId ?? null };
}

/**
 * The document of the own and the shared data of the person (FR-SEC-05). It
 * reads the local database only; nothing leaves the device here.
 */
export async function buildExport(deps: {
  database: LocalDatabase;
  clock: Pick<Clock, "nowMs">;
}): Promise<ExportDocument> {
  const { database, clock } = deps;
  const source: Source = { database, devices: await devicesOf(database) };
  const document: ExportDocument = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date(clock.nowMs()).toISOString(),
  };
  for (const { section, build } of Object.values(EXPORTED)) {
    document[section] = await build(source);
  }
  return document;
}
