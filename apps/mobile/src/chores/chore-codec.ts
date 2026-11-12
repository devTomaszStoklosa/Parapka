import {
  validateAssignment,
  validateChoreRule,
  validateChoreTitle,
  type Assignment,
  type ChoreRule,
  type Person,
} from "@parapka/domain";

import { isValidNote, isValidReminder } from "./chore-extras";

export type ChoreField = "title" | "rule" | "assignment" | "note" | "reminder";

/** The ids of the two devices, to turn a `Person` into a device and back. */
export interface Devices {
  readonly own: string | null;
  readonly partner: string | null;
}

/** An assignment as it is synced: people are device ids, not "me"/"partner". */
export type StoredAssignment =
  | { kind: "person"; deviceId: string }
  | { kind: "both" }
  | { kind: "alternating"; firstDeviceId: string; startDate: string }
  | { kind: "anyone" };

export class ChoreDeviceError extends Error {
  constructor() {
    super("the device of the person is not known yet");
    this.name = "ChoreDeviceError";
  }
}

const RULE_KINDS = ["daily", "everyNDays", "weekdays", "monthly", "occasional"];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const deviceOf = (person: Person, devices: Devices): string => {
  const id = person === "me" ? devices.own : devices.partner;
  if (id === null) throw new ChoreDeviceError();
  return id;
};

const personOf = (deviceId: string, devices: Devices): Person =>
  deviceId === devices.own ? "me" : "partner";

export function encodeAssignment(
  assignment: Assignment,
  devices: Devices,
): StoredAssignment {
  switch (assignment.kind) {
    case "person":
      return { kind: "person", deviceId: deviceOf(assignment.person, devices) };
    case "alternating":
      return {
        kind: "alternating",
        firstDeviceId: deviceOf(assignment.firstPerson, devices),
        startDate: assignment.startDate,
      };
    case "both":
    case "anyone":
      return { kind: assignment.kind };
  }
}

/** The assignment from the point of view of this device. */
export function decodeAssignment(
  stored: StoredAssignment,
  devices: Devices,
): Assignment {
  switch (stored.kind) {
    case "person":
      return { kind: "person", person: personOf(stored.deviceId, devices) };
    case "alternating":
      return {
        kind: "alternating",
        firstPerson: personOf(stored.firstDeviceId, devices),
        startDate: stored.startDate,
      };
    case "both":
    case "anyone":
      return { kind: stored.kind };
  }
}

const isStoredAssignment = (value: unknown): value is StoredAssignment => {
  if (!isObject(value)) return false;
  const text = (name: string) =>
    typeof value[name] === "string" && value[name] !== "";
  switch (value.kind) {
    case "person":
      return text("deviceId");
    case "alternating":
      return text("firstDeviceId") && text("startDate");
    case "both":
    case "anyone":
      return true;
    default:
      return false;
  }
};

const passes = (check: () => void): boolean => {
  try {
    check();
    return true;
  } catch {
    return false;
  }
};

export const isChoreField = (name: string): name is ChoreField =>
  name === "title" ||
  name === "rule" ||
  name === "assignment" ||
  name === "note" ||
  name === "reminder";

/** True when a value that came from the partner may be kept as the field. */
export function isValidField(name: ChoreField, value: unknown): boolean {
  switch (name) {
    case "title":
      return (
        typeof value === "string" &&
        passes(() => {
          validateChoreTitle(value);
        })
      );
    case "note":
      return isValidNote(value);
    case "reminder":
      return isValidReminder(value);
    case "rule":
      return (
        isObject(value) &&
        RULE_KINDS.includes(value.kind as string) &&
        passes(() => {
          validateChoreRule(value as unknown as ChoreRule);
        })
      );
    case "assignment":
      return (
        isStoredAssignment(value) &&
        passes(() => {
          validateAssignment(
            decodeAssignment(value, { own: null, partner: null }),
          );
        })
      );
  }
}
