import { wireConsent } from "../consent/wiring";
import { createIdentity } from "../identity/identity";
import { createRelayClient, type DeviceCredentials } from "../net/relay-client";
import { createPairRepository } from "../pairing/pair-repository";
import type { Platform } from "../platform/context";
import { createHandlerRegistry } from "./handler-registry";
import { createPartnerProfileRepository } from "./partner-profile-repository";
import { createPauseRepository } from "./pause-repository";
import { createProfileHandler } from "./profile-handler";
import { createRelayTransport } from "./relay-transport";
import { createSyncEngine } from "./sync-engine";
import { createSyncScheduler, type SyncScheduler } from "./sync-scheduler";
import type { SyncTransport } from "./transport";

/** The message logged when the relay says the pair is gone; it holds no data. */
export const PAIR_GONE_MESSAGE = "Synchronization stopped: the pair is gone.";

export interface SyncController {
  /** The app moved to the foreground (true) or away from it (false). */
  setActive(active: boolean): void;
  /** The screen is shown and unlocked. */
  mount(): void;
  /** The screen is gone or locked. */
  unmount(): void;
}

const wired = new WeakMap<Platform, SyncController>();

function createDependencies(platform: Platform) {
  const { database, sodium, sha256, keyStore } = platform;
  const client = (credentials?: DeviceCredentials) =>
    createRelayClient({
      baseUrl: platform.relayUrl,
      fetch: (url, init) => globalThis.fetch(url, init),
      sodium,
      sha256,
      ...(credentials ? { credentials } : {}),
    });
  const identity = createIdentity({
    sodium,
    keyStore,
    database,
    relay: client,
  });
  return {
    client,
    identity,
    pairs: createPairRepository(database, keyStore),
    partner: createPartnerProfileRepository(database),
    pause: createPauseRepository(database),
    ...wireConsent(platform),
  };
}

type Dependencies = ReturnType<typeof createDependencies>;

const METHODS = ["send", "fetch", "ack", "onNotify"] as const;

/** A transport that forwards every call to the one `current` returns. */
function delegating(current: () => SyncTransport): SyncTransport {
  const forward =
    (name: (typeof METHODS)[number]) =>
    (...args: unknown[]) =>
      (current()[name] as (...call: unknown[]) => unknown)(...args);
  return Object.fromEntries(
    METHODS.map((name) => [name, forward(name)]),
  ) as unknown as SyncTransport;
}

/**
 * The engine is made once; it talks through the transport of the running
 * session, which `use` replaces on every start.
 */
function createEngine(platform: Platform, deps: Dependencies) {
  const { database, sodium, clock } = platform;
  const { consent, profiles, partner, pairs, identity, pause } = deps;
  const registry = createHandlerRegistry();
  registry.register(
    createProfileHandler({ database, profiles, partner, consent }),
  );
  let transport: SyncTransport | null = null;
  const current = (): SyncTransport => {
    if (transport === null) throw new Error("There is no session");
    return transport;
  };
  const engine = createSyncEngine({
    database,
    pairs,
    identity,
    sodium,
    clock,
    registry,
    canSync: consent.canSync.bind(consent),
    isShared: consent.isShared.bind(consent),
    isPaused: () => pause.isPaused(),
    transport: delegating(current),
  });
  return {
    engine,
    use: (next: SyncTransport | null) => {
      transport = next;
    },
  };
}

interface Session {
  readonly mailboxId: string;
  readonly scheduler: SyncScheduler;
}

type Engine = ReturnType<typeof createEngine>;

/** The transport and the scheduler of the running session, if any. */
function createSessions(platform: Platform, deps: Dependencies, e: Engine) {
  let session: Session | null = null;
  const stop = () => {
    session?.scheduler.stop();
    session = null;
    e.use(null);
  };
  const start = async (mailboxId: string, isCurrent: () => boolean) => {
    const credentials = await deps.identity.credentials();
    const { createSocket } = platform;
    if (!isCurrent() || credentials === null || !createSocket) return;
    const transport = createRelayTransport({
      client: deps.client(credentials),
      pairMailboxId: mailboxId,
      createSocket,
    });
    e.use(transport);
    const scheduler = createSyncScheduler({
      run: () => e.engine.sync(),
      transport,
      onPairGone: () => {
        stop();
        console.warn(PAIR_GONE_MESSAGE);
      },
    });
    session = { mailboxId, scheduler };
    scheduler.start();
  };
  return {
    start,
    stop,
    mailboxId: () => session?.mailboxId ?? null,
    requestSync: () => {
      session?.scheduler.requestSync();
    },
  };
}

interface Conditions {
  active: boolean;
  mounted: boolean;
  version: number;
}

/** The mailbox to synchronize now, or null when a condition is not met. */
async function wantedMailbox(state: Conditions, deps: Dependencies) {
  if (!state.active || !state.mounted || !(await deps.consent.canSync())) {
    return null;
  }
  return (await deps.pairs.activePair())?.pairMailboxId ?? null;
}

function build(platform: Platform): SyncController {
  const deps = createDependencies(platform);
  const { consent, profiles, pairs, pause } = deps;
  const sessions = createSessions(platform, deps, createEngine(platform, deps));
  const state: Conditions = { active: false, mounted: false, version: 0 };

  const evaluate = async () => {
    state.version += 1;
    const issued = state.version;
    const mailboxId = await wantedMailbox(state, deps);
    if (issued !== state.version) return;
    if (sessions.mailboxId() !== mailboxId) sessions.stop();
    if (mailboxId !== null && sessions.mailboxId() === null) {
      await sessions.start(mailboxId, () => issued === state.version);
    }
  };
  const reevaluate = () => {
    evaluate().catch(sessions.stop);
  };

  pairs.subscribe(reevaluate);
  consent.onSaved(reevaluate);
  consent.onChange(() => {
    reevaluate();
    sessions.requestSync();
  });
  profiles.subscribe(sessions.requestSync);
  pause.subscribe(sessions.requestSync);

  const set = (change: Partial<Conditions>) => () => {
    Object.assign(state, change);
    reevaluate();
  };
  return {
    setActive: (active) => {
      set({ active })();
    },
    mount: set({ mounted: true }),
    unmount: set({ mounted: false }),
  };
}

/**
 * The synchronization of the platform: one controller per platform, so the
 * engine is made once. A transport and a scheduler live only while the pair is
 * confirmed, the consent is saved, the app is active and the screen is shown;
 * a stopped scheduler does not start again, so every resume makes new ones.
 */
export function wireSync(platform: Platform): SyncController {
  let controller = wired.get(platform);
  if (!controller) {
    controller = build(platform);
    wired.set(platform, controller);
  }
  return controller;
}
