import { expect, it } from "vitest";

import { t, type TranslationKey } from "../i18n";
import type { NotificationText } from "./planned";
import {
  initialState,
  newEvents,
  nextState,
  planEvent,
  takenBy,
  type Observation,
  type WatchState,
} from "./event-detectors";

const NOTHING: Observation = {
  taken: [],
  weeks: [],
  paired: false,
  disconnected: false,
};
const KNOWN: WatchState = initialState(NOTHING);

const entry = (requestId: string, status: string, requestedBy = "me") => ({
  requestId,
  itemId: `item-${requestId}`,
  requestedBy,
  status,
});

it("takes only the accepted requests of this person", () => {
  const entries = [
    entry("r1", "pending"),
    entry("r1", "accepted"),
    entry("r2", "pending"),
    entry("r2", "declined"),
    entry("r3", "accepted", "partner"),
  ];
  expect(takenBy(entries, "me")).toEqual([
    { requestId: "r1", itemId: "item-r1" },
  ]);
});

it("reports what is new and not what is known", () => {
  const now: Observation = {
    taken: [{ requestId: "r1", itemId: "i" }],
    weeks: ["2026-W46"],
    paired: true,
    disconnected: true,
  };
  expect(newEvents(KNOWN, now).map(({ kind }) => kind)).toEqual([
    "handover-taken",
    "checkin-results",
    "pair-connected",
    "pair-disconnected",
  ]);
  expect(newEvents(nextState(KNOWN, now), now)).toEqual([]);
});

it("keeps the known identifiers when they vanish and reports a new pair", () => {
  const seen = nextState(KNOWN, {
    ...NOTHING,
    taken: [{ requestId: "r1", itemId: "i" }],
    weeks: ["2026-W46"],
    paired: true,
  });
  const gone = nextState(seen, NOTHING);
  expect(gone).toEqual({
    handovers: ["r1"],
    revealed: ["2026-W46"],
    paired: false,
    disconnected: false,
  });
  expect(
    newEvents(gone, {
      taken: [{ requestId: "r1", itemId: "i" }],
      weeks: ["2026-W46"],
      paired: true,
      disconnected: false,
    }).map(({ kind }) => kind),
  ).toEqual(["pair-connected"]);
});

const planned = (partner: Parameters<typeof planEvent>[1]["partner"]) =>
  planEvent(
    { kind: "handover-taken", request: { requestId: "r1", itemId: "i" } },
    { atMs: 5, partner, title: "Szczepienie" },
  );

const render = ({ key, params }: NotificationText) =>
  t(key as TranslationKey, params);

it.each([
  ["feminine", "Maja przejęła: Szczepienie"],
  ["masculine", "Maja przejął: Szczepienie"],
  ["neutral", "Maja przejmuje: Szczepienie"],
] as const)("words the handover by the form %s", (form, title) => {
  const item = planned({ name: "Maja", form });
  expect(item).toMatchObject({
    id: "handover-taken:r1",
    type: "handover-taken",
  });
  expect(render(item.title)).toBe(title);
});

it("words the handover without a name before the profile arrives", () => {
  const item = planned(null);
  expect(item.title.params).toEqual({ title: "Szczepienie" });
  expect(render(item.title)).toBe("Rzecz została przejęta: Szczepienie");
});

it("names a thing without a known title neutrally", () => {
  const item = planEvent(
    { kind: "handover-taken", request: { requestId: "r1", itemId: "i" } },
    { atMs: 5, partner: null, title: null },
  );
  expect(render(item.title)).toBe("Rzecz została przejęta: rzecz wspólna");
});

it("words the other events and gives each occurrence of the pair its own id", () => {
  const context = { atMs: 7, partner: null, title: null };
  const events = [
    planEvent({ kind: "checkin-results", week: "2026-W46" }, context),
    planEvent({ kind: "pair-connected" }, context),
    planEvent({ kind: "pair-disconnected" }, context),
  ];
  expect(events.map(({ id, type }) => [id, type])).toEqual([
    ["checkin-results:2026-W46", "checkin-results"],
    ["pair-status:connected:7", "pair-status"],
    ["pair-status:disconnected:7", "pair-status"],
  ]);
  expect(events.map(({ title }) => render(title))).toEqual([
    "Wyniki check-inu są gotowe",
    "Para została połączona",
    "Para została rozłączona",
  ]);
});
