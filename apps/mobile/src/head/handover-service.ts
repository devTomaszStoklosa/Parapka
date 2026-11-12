import { ChoreValidationError } from "@parapka/domain";
import { compareHlc, currentHandoverRequests, parseHlc } from "@parapka/sync";

import { ChoreDeviceError } from "../chores/chore-codec";
import type { Identity } from "../identity/identity";
import type { PairRepository } from "../pairing/pair-repository";
import type { CarrierRepository } from "./carrier-repository";
import type { HandoverRepository } from "./handover-repository";
import type { HeadItem, HeadService } from "./head-service";

/** A pending request with the item it is about, as the screens see it. */
export interface HandoverView {
  readonly requestId: string;
  readonly item: HeadItem;
  /** The `deviceId` of the one who asked. */
  readonly requestedBy: string;
}

export interface HandoverService {
  /**
   * "Please take it over" (FR-MNT-03): an open, shared item that I carry, alone
   * or with the partner, and that has no pending request. Throws otherwise.
   */
  requestHandover(itemId: string): Promise<string>;
  /** The partner's pending request is accepted: I carry the item now. */
  acceptHandover(requestId: string): Promise<void>;
  /** The partner's pending request is declined; the carrier stays. */
  declineHandover(requestId: string): Promise<void>;
  /** Pending requests of the partner to me. */
  incoming(): Promise<HandoverView[]>;
  /** My pending requests. */
  outgoing(): Promise<HandoverView[]>;
  subscribe(listener: () => void): () => void;
}

interface Deps {
  handovers: HandoverRepository;
  carriers: CarrierRepository;
  head: Pick<HeadService, "list" | "subscribe">;
  pairs: Pick<PairRepository, "activePair">;
  identity: Pick<Identity, "deviceId">;
  newId: () => string;
}

async function ownDevice({ identity }: Deps) {
  const deviceId = await identity.deviceId();
  if (deviceId === null) throw new ChoreDeviceError();
  return deviceId;
}

/** The latest of the HLCs (text form), by order and not by text. */
const latest = (times: string[]) =>
  times.reduce((a, b) => (compareHlc(parseHlc(a), parseHlc(b)) > 0 ? a : b));

const timesOf = async (deps: Deps, requestId: string) =>
  (await deps.handovers.list())
    .filter((e) => e.requestId === requestId)
    .map((e) => e.changedAt);

/** The pending requests of open, shared items; the rest is gone. */
async function pending(deps: Deps): Promise<HandoverView[]> {
  const entries = await deps.handovers.list();
  const askers = new Map(entries.map((e) => [e.requestId, e.requestedBy]));
  const current = currentHandoverRequests(
    entries.map((e) => ({ ...e, hlc: parseHlc(e.changedAt) })),
  );
  const items = new Map((await deps.head.list()).map((i) => [i.id, i]));
  const views: HandoverView[] = [];
  for (const request of current.values()) {
    const item = items.get(request.itemId);
    if (request.status !== "pending") continue;
    if (item?.status !== "open" || !item.shared) continue;
    const requestedBy = askers.get(request.requestId) ?? "";
    views.push({ requestId: request.requestId, item, requestedBy });
  }
  return views;
}

async function answer(
  deps: Deps,
  requestId: string,
  status: "accepted" | "declined",
) {
  const own = await ownDevice(deps);
  const view = (await pending(deps)).find((v) => v.requestId === requestId);
  if (view === undefined || view.requestedBy === own) {
    throw new ChoreValidationError("there is no such request to answer");
  }
  await deps.handovers.append({
    requestId,
    itemId: view.item.id,
    requestedBy: view.requestedBy,
    status,
    shared: true,
    after: latest(await timesOf(deps, requestId)),
  });
  if (status === "accepted") {
    const carried = (await deps.carriers.list())
      .filter((e) => e.itemId === view.item.id)
      .map((e) => e.changedAt);
    await deps.carriers.append({
      itemId: view.item.id,
      carrier: own,
      shared: true,
      after: latest([...(await timesOf(deps, requestId)), ...carried]),
    });
  }
}

async function request(deps: Deps, itemId: string) {
  const own = await ownDevice(deps);
  if ((await deps.pairs.activePair()) === null) {
    throw new ChoreValidationError("there is no partner to ask");
  }
  const item = (await deps.head.list()).find(({ id }) => id === itemId);
  if (item === undefined) throw new ChoreValidationError("unknown item");
  const mine = item.carrier === "me" || item.carrier === "both";
  if (item.status !== "open" || !item.shared || !mine) {
    throw new ChoreValidationError("this item cannot be handed over");
  }
  if ((await pending(deps)).some((v) => v.item.id === itemId)) {
    throw new ChoreValidationError("this item already has a request");
  }
  const requestId = deps.newId();
  await deps.handovers.append({
    requestId,
    itemId,
    requestedBy: own,
    status: "pending",
    shared: true,
  });
  return requestId;
}

export function createHandoverService(deps: Deps): HandoverService {
  const byAsker = async (mine: boolean) => {
    const own = await deps.identity.deviceId();
    return (await pending(deps)).filter(
      (v) => (v.requestedBy === own) === mine,
    );
  };
  return {
    requestHandover: (itemId) => request(deps, itemId),
    acceptHandover: (requestId) => answer(deps, requestId, "accepted"),
    declineHandover: (requestId) => answer(deps, requestId, "declined"),
    incoming: () => byAsker(false),
    outgoing: () => byAsker(true),
    subscribe: (listener) => {
      const stops = [
        deps.head.subscribe(listener),
        deps.handovers.subscribe(listener),
      ];
      return () => {
        for (const stop of stops) stop();
      };
    },
  };
}
