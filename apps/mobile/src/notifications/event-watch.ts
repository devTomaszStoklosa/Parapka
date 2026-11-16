import { wireCheckin } from "../checkin/wiring";
import { REVEALED_COLLECTION } from "../checkin/reveal";
import { wireChores } from "../chores/wiring";
import type { ConsentCategory } from "../consent/consent-model";
import { wireConsent } from "../consent/wiring";
import type { JsonValue, LocalDatabase } from "../data/local-database";
import { wireHead } from "../head/wiring";
import { createDisconnectRepository } from "../pairing/disconnect-repository";
import type { Platform } from "../platform/context";
import { createPartnerProfileRepository } from "../sync/partner-profile-repository";
import { enqueueNotification } from "./delivery";
import {
  initialState,
  newEvents,
  nextState,
  planEvent,
  takenBy,
  type Observation,
  type PartnerName,
  type WatchState,
} from "./event-detectors";
import type { NotificationTypeId } from "./notification-types";
import {
  createNotificationSettingsRepository,
  type NotificationSettings,
} from "./notification-settings";

const COLLECTION = "notification-watch";
const ID = "state";

type Subscribe = (listener: () => void) => () => void;

/** The sources of the observer; the repositories of the app fit them. */
export interface EventWatchDeps {
  readonly database: LocalDatabase;
  readonly clock: { nowMs(): number };
  readonly deviceId: () => Promise<string | null>;
  readonly handovers: {
    list(): Promise<
      {
        requestId: string;
        itemId: string;
        requestedBy: string;
        status: string;
      }[]
    >;
    subscribe: Subscribe;
  };
  readonly items: { list(): Promise<{ id: string; title: string }[]> };
  readonly reveal: { subscribe: Subscribe };
  readonly pairs: {
    activePair(): Promise<unknown>;
    subscribe: Subscribe;
  };
  readonly disconnect: {
    state(): Promise<"none" | "by-partner">;
    subscribe: Subscribe;
  };
  readonly partner: { get(): Promise<PartnerName | null> };
  readonly isShared: (category: ConsentCategory) => Promise<boolean>;
  readonly settings: { get(): Promise<NotificationSettings> };
}

export interface EventWatch {
  /** Looks at the local state now, one look at a time; resolves when it is done. */
  scan(): Promise<void>;
  /** Looks after every change of a source; returns the function that stops it. */
  start(): () => void;
}

async function observe(deps: EventWatchDeps): Promise<Observation> {
  const deviceId = await deps.deviceId();
  const entries = deviceId === null ? [] : await deps.handovers.list();
  return {
    taken: takenBy(entries, deviceId ?? ""),
    weeks: (await deps.database.list(REVEALED_COLLECTION)).map(({ id }) => id),
    paired: (await deps.pairs.activePair()) !== null,
    disconnected: (await deps.disconnect.state()) === "by-partner",
  };
}

/**
 * Whether the person gets the notification of the event: the type is turned
 * on and the feature behind it is on too (the consent). The results of the
 * check-in need a pair and the consent of CHECKIN, a handover the consent of
 * SHARED_MENTAL_LOAD. The look has remembered the event either way.
 */
async function wanted(
  deps: EventWatchDeps,
  settings: NotificationSettings,
  type: NotificationTypeId,
  now: Observation,
): Promise<boolean> {
  if (!settings.enabled[type]) return false;
  if (type === "handover-taken") {
    return deps.isShared("SHARED_MENTAL_LOAD");
  }
  if (type === "checkin-results") {
    return now.paired && (await deps.isShared("CHECKIN"));
  }
  return true;
}

async function lookOnce(deps: EventWatchDeps): Promise<void> {
  const { database, clock } = deps;
  const now = await observe(deps);
  const known = (await database.get(
    COLLECTION,
    ID,
  )) as unknown as WatchState | null;
  const settings = await deps.settings.get();
  const partner = await deps.partner.get();
  const titles = new Map(
    (await deps.items.list()).map(({ id, title }) => [id, title]),
  );
  for (const event of known ? newEvents(known, now) : []) {
    const item = event.kind === "handover-taken" ? event.request.itemId : "";
    const planned = planEvent(event, {
      atMs: clock.nowMs(),
      partner,
      title: titles.get(item) ?? null,
    });
    if (await wanted(deps, settings, planned.type, now)) {
      await enqueueNotification(database, planned);
    }
  }
  // The state is saved after the queue: a failure repeats the look, and the
  // ids of the handovers and the weeks keep it from a second notification.
  const next = known ? nextState(known, now) : initialState(now);
  await database.put(COLLECTION, ID, next as unknown as JsonValue);
}

/**
 * Notifications of the events that arrive with the synchronization (FR-NOT-05):
 * the partner took over a thing, the results of the check-in, the pair
 * connected or disconnected by the partner. It compares the local state with
 * the one it remembered (`notification-watch`, never synchronized), so it needs
 * no change in the handlers. The first look only remembers. The partner's
 * pause, consents, refusals, giving away and arrears are not watched (FR-NOT-06).
 */
export function createEventWatch(deps: EventWatchDeps): EventWatch {
  let chain: Promise<void> = Promise.resolve();
  const scan = () => {
    const look = chain.then(() => lookOnce(deps));
    chain = look.catch(() => undefined);
    return look;
  };
  return {
    scan,
    start: () => {
      const sources = [
        deps.handovers,
        deps.reveal,
        deps.pairs,
        deps.disconnect,
      ];
      const stops = sources.map((source) =>
        source.subscribe(() => {
          // A failed look is repeated by the next change or by the runner.
          scan().catch(() => undefined);
        }),
      );
      return () => {
        for (const stop of stops) stop();
      };
    },
  };
}

const wired = new WeakMap<Platform, EventWatch>();

/** The observer of the platform: one per platform, on the real repositories. */
export function wireEventWatch(platform: Platform): EventWatch {
  const known = wired.get(platform);
  if (known) return known;
  const { database, clock } = platform;
  const { pairs, identity } = wireChores(platform);
  const { handovers, items } = wireHead(platform);
  const { reveal } = wireCheckin(platform);
  const { consent } = wireConsent(platform);
  const watch = createEventWatch({
    database,
    clock,
    deviceId: () => identity.deviceId(),
    handovers,
    items,
    reveal,
    pairs,
    disconnect: createDisconnectRepository(database),
    partner: createPartnerProfileRepository(database),
    isShared: consent.isShared.bind(consent),
    settings: createNotificationSettingsRepository(database),
  });
  wired.set(platform, watch);
  return watch;
}
