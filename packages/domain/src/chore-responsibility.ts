import { ChoreValidationError, listOccurrences, type Chore } from "./chore.js";
import {
  fromDayNumber,
  toDayNumber,
  type CalendarDate,
} from "./cycle-forecast.js";

/** People are named from the user's point of view. */
export type Person = "me" | "partner";

export type Assignment =
  | { kind: "person"; person: Person }
  | { kind: "both" }
  /** Occurrences alternate, the first one (on `startDate`) goes to `firstPerson`. */
  | { kind: "alternating"; firstPerson: Person; startDate: CalendarDate }
  | { kind: "anyone" };

/** Who is responsible for one occurrence. */
export type Responsible = Person | "both" | "anyone";

export type ChoreFilter = "mine" | "partner" | "shared";

export interface AssignedChore {
  chore: Chore;
  assignment: Assignment;
}

const PEOPLE: readonly string[] = ["me", "partner"];

export function validateAssignment(assignment: Assignment): void {
  switch (assignment.kind) {
    case "person":
      if (!PEOPLE.includes(assignment.person)) {
        throw new ChoreValidationError("invalid person");
      }
      return;
    case "alternating":
      if (!PEOPLE.includes(assignment.firstPerson)) {
        throw new ChoreValidationError("invalid person");
      }
      toDayNumber(assignment.startDate);
      return;
    case "both":
    case "anyone":
      return;
  }
}

function otherPerson(person: Person): Person {
  return person === "me" ? "partner" : "me";
}

/**
 * Responsible for the occurrence on `date`. For an alternating assignment the
 * result depends only on the chore, the assignment and the date.
 */
export function responsibleFor(
  chore: Chore,
  assignment: Assignment,
  date: CalendarDate,
): Responsible {
  validateAssignment(assignment);
  switch (assignment.kind) {
    case "person":
      return assignment.person;
    case "both":
    case "anyone":
      return assignment.kind;
    case "alternating": {
      const day = toDayNumber(date);
      const start = toDayNumber(assignment.startDate);
      if (day < start) {
        throw new ChoreValidationError("date is before the alternating start");
      }
      const index =
        day === start
          ? 0
          : listOccurrences(chore, assignment.startDate, fromDayNumber(day - 1))
              .length;
      return index % 2 === 0
        ? assignment.firstPerson
        : otherPerson(assignment.firstPerson);
    }
  }
}

/** Only the responsible person gets a reminder (FR-CHR-05). */
export function reminderRecipients(
  chore: Chore,
  assignment: Assignment,
  date: CalendarDate,
): Person[] {
  const responsible = responsibleFor(chore, assignment, date);
  return responsible === "both" || responsible === "anyone"
    ? ["me", "partner"]
    : [responsible];
}

/** Handing a chore over: anyone becomes responsible; no reason, no event (ZP-2). */
export function releaseChore(): Assignment {
  return { kind: "anyone" };
}

export function filterChores(
  items: readonly AssignedChore[],
  filter: ChoreFilter,
  date: CalendarDate,
): AssignedChore[] {
  return items.filter(({ chore, assignment }) => {
    const responsible = responsibleFor(chore, assignment, date);
    switch (filter) {
      case "mine":
        return responsible === "me";
      case "partner":
        return responsible === "partner";
      case "shared":
        return responsible === "both" || responsible === "anyone";
    }
  });
}
