import type { GrammaticalForm } from "@parapka/domain";

import { t } from "../i18n";
import type { NotificationText, PlannedNotification } from "./planned";

/** What the observer remembers between two looks: only identifiers and flags. */
export interface WatchState {
  /** Requests of this person that the partner has accepted. Only grows. */
  readonly handovers: readonly string[];
  /** Weeks with revealed check-in results. Only grows. */
  readonly revealed: readonly string[];
  /** Whether the pair was confirmed. */
  readonly paired: boolean;
  /** Whether the partner ended the pair and the person has not seen it yet. */
  readonly disconnected: boolean;
}

/** An accepted request of this person, with the thing it is about. */
export interface TakenRequest {
  readonly requestId: string;
  readonly itemId: string;
}

/** The local state as it is now. */
export interface Observation {
  readonly taken: readonly TakenRequest[];
  readonly weeks: readonly string[];
  readonly paired: boolean;
  readonly disconnected: boolean;
}

export type WatchEvent =
  | { readonly kind: "handover-taken"; readonly request: TakenRequest }
  | { readonly kind: "checkin-results"; readonly week: string }
  | { readonly kind: "pair-connected" }
  | { readonly kind: "pair-disconnected" };

/** The partner as far as the profile has arrived. */
export interface PartnerName {
  readonly name: string;
  readonly form: GrammaticalForm;
}

/** The requests of `deviceId` that the partner accepted; a refusal is not one. */
export function takenBy(
  entries: readonly {
    requestId: string;
    itemId: string;
    requestedBy: string;
    status: string;
  }[],
  deviceId: string,
): TakenRequest[] {
  const taken = new Map<string, TakenRequest>();
  for (const { requestId, itemId, requestedBy, status } of entries) {
    if (requestedBy === deviceId && status === "accepted") {
      taken.set(requestId, { requestId, itemId });
    }
  }
  return [...taken.values()];
}

/** What is new since `state`: new accepted requests and weeks, the pair's changes. */
export function newEvents(state: WatchState, now: Observation): WatchEvent[] {
  const events: WatchEvent[] = [];
  for (const request of now.taken) {
    if (!state.handovers.includes(request.requestId)) {
      events.push({ kind: "handover-taken", request });
    }
  }
  for (const week of now.weeks) {
    if (!state.revealed.includes(week)) {
      events.push({ kind: "checkin-results", week });
    }
  }
  if (now.paired && !state.paired) events.push({ kind: "pair-connected" });
  if (now.disconnected && !state.disconnected) {
    events.push({ kind: "pair-disconnected" });
  }
  return events;
}

/** The state to remember after the look: the known identifiers and the new ones. */
export function nextState(state: WatchState, now: Observation): WatchState {
  return {
    handovers: [
      ...new Set([...state.handovers, ...now.taken.map((r) => r.requestId)]),
    ],
    revealed: [...new Set([...state.revealed, ...now.weeks])],
    paired: now.paired,
    disconnected: now.disconnected,
  };
}

/** The state of the first look: everything now is already known. */
export const initialState = (now: Observation): WatchState =>
  nextState(
    { handovers: [], revealed: [], paired: false, disconnected: false },
    now,
  );

const text = (
  key: string,
  params?: Record<string, string>,
): NotificationText => (params ? { key, params } : { key });

function handoverText(partner: PartnerName | null, title: string) {
  const base = "notifications.handoverTaken";
  const key = partner ? `${base}.${partner.form}` : `${base}.anonymous`;
  return {
    title: text(
      `${key}.title`,
      partner ? { name: partner.name, title } : { title },
    ),
    body: text(`${base}.body`),
  };
}

/**
 * The notification of an event. Only a text key and its parameters, the name
 * of the partner and the title of the shared thing, are kept; nothing about
 * the cycle. `title` is the title of the thing of a handover, if known.
 */
export function planEvent(
  event: WatchEvent,
  context: {
    atMs: number;
    partner: PartnerName | null;
    title: string | null;
  },
): PlannedNotification {
  const { atMs, partner } = context;
  switch (event.kind) {
    case "handover-taken":
      return {
        id: `handover-taken:${event.request.requestId}`,
        type: "handover-taken",
        atMs,
        ...handoverText(
          partner,
          context.title ?? t("notifications.handoverTaken.untitled"),
        ),
      };
    case "checkin-results":
      return {
        id: `checkin-results:${event.week}`,
        type: "checkin-results",
        atMs,
        title: text("notifications.checkinResults.title"),
        body: text("notifications.checkinResults.body"),
      };
    case "pair-connected":
      return {
        id: `pair-status:connected:${String(atMs)}`,
        type: "pair-status",
        atMs,
        title: text("notifications.pairConnected.title"),
        body: text("notifications.pairConnected.body"),
      };
    case "pair-disconnected":
      return {
        id: `pair-status:disconnected:${String(atMs)}`,
        type: "pair-status",
        atMs,
        title: text("notifications.pairDisconnected.title"),
        body: text("notifications.pairDisconnected.body"),
      };
  }
}
