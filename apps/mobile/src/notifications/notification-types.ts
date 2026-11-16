/** Where the notification of a type comes from (spec 5.7, FR-NOT-05). */
export type NotificationSource =
  "chore" | "checkin" | "partner-hint" | "cycle" | "handover" | "pair";

export interface NotificationType {
  readonly id: string;
  /** The state without a saved choice; every type can be turned off. */
  readonly defaultEnabled: boolean;
  readonly source: NotificationSource;
  /** What causes the notification. */
  readonly description: string;
}

export const NOTIFICATION_TYPES = [
  {
    id: "chore-reminder",
    defaultEnabled: true,
    source: "chore",
    description: "Reminder of a chore, for the person responsible for it",
  },
  {
    id: "checkin",
    defaultEnabled: true,
    source: "checkin",
    description: "Reminder to fill in the check-in",
  },
  {
    id: "partner-hint",
    defaultEnabled: true,
    source: "partner-hint",
    description:
      "The hint of the day for the partner, at a time that can change",
  },
  {
    id: "wellbeing",
    defaultEnabled: false,
    source: "cycle",
    description: "Reminder to note the well-being (cycle settings)",
  },
  {
    id: "handover-taken",
    defaultEnabled: true,
    source: "handover",
    description: "The partner took over a chore",
  },
  {
    id: "checkin-results",
    defaultEnabled: true,
    source: "checkin",
    description: "The check-in results are ready",
  },
  {
    id: "pair-status",
    defaultEnabled: true,
    source: "pair",
    description: "The pair was connected or disconnected, worded neutrally",
  },
] as const satisfies readonly NotificationType[];

export type NotificationTypeId = (typeof NOTIFICATION_TYPES)[number]["id"];

/**
 * Events that never cause a notification (FR-NOT-06). Documentation for the
 * test: the registry has no type for any of them.
 */
export const FORBIDDEN_NOTIFICATION_EVENTS = [
  "partner-pause",
  "partner-consent-change",
  "handover-refused",
  "chore-given-away",
  "partner-overdue",
  "partner-checkin-before-reveal",
] as const;
