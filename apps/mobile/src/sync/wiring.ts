import { createUuid7Generator } from "@parapka/domain";

import { createChoreHandler } from "../chores/chore-handler";
import { createChoreRepository } from "../chores/chore-repository";
import { createChoreCompletionHandler } from "../chores/completion-handler";
import { createCompletionRepository } from "../chores/completion-repository";
import { wireConsent } from "../consent/wiring";
import { createIdentity } from "../identity/identity";
import { createRelayClient, type DeviceCredentials } from "../net/relay-client";
import { clearPairLocally } from "../pairing/clear-pair";
import {
  disconnect as disconnectPair,
  finishClosing,
} from "../pairing/disconnect";
import { createDisconnectRepository } from "../pairing/disconnect-repository";
import { createPairRepository } from "../pairing/pair-repository";
import type { Platform } from "../platform/context";
import { createClosingRetry } from "./closing-retry";
import {
  createHandlerRegistry,
  type HandlerRegistry,
} from "./handler-registry";
import { createPairHandler } from "./pair-handler";
import { createPartnerProfileRepository } from "./partner-profile-repository";
import { createPauseRepository } from "./pause-repository";
import { createProfileHandler } from "./profile-handler";
import { createRelayTransport } from "./relay-transport";
import { createSyncEngine } from "./sync-engine";
import { createSyncScheduler, type SyncScheduler } from "./sync-scheduler";
import type { SyncTransport } from "./transport";

/** The message logged when the relay says the pair is gone; it holds no data. */
export const PAIR_GONE_MESSAGE = "Synchronization stopped: the pair is gone.";
/** The message logged when the local cleanup after the pair ended fails. */
export const CLEANUP_FAILED_MESSAGE = "The cleanup after the pair failed.";

export interface SyncController {
  /** The app moved to the foreground (true) or away from it (false). */
  setActive(active: boolean): void;
  /** The screen is shown and unlocked. */
  mount(): void;
  /** The screen is gone or locked. */
  unmount(): void;
  /** Ends the pair on the initiative of this person (FR-PAIR-07). */
  disconnect(): Promise<void>;
}

const wired = new WeakMap<Platform, SyncController>();

function createDependencies(platform: Platform) {
  const { database, sodium, sha256, keyStore, clock } = platform;
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
  const pairs = createPairRepository(database, keyStore);
  const chores = createChoreRepository({
    database,
    pairs,
    identity,
    newId: createUuid7Generator({
      clock,
      random: { bytes: (length) => sodium.randomBytes(length) },
    }),
  });
  return {
    client,
    identity,
    pairs,
    chores,
    completions: createCompletionRepository({
      database,
      chores,
      identity,
      clock,
    }),
    disconnect: createDisconnectRepository(database),
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
  const { chores, completions } = deps;
  const registry = createHandlerRegistry();
  registry.register(
    createProfileHandler({ database, profiles, partner, consent }),
  );
  registry.register(createChoreHandler({ chores }));
  registry.register(createChoreCompletionHandler({ completions }));
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
    registry,
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
function createSessions(
  platform: Platform,
  deps: Dependencies,
  e: Engine,
  onPairGone: () => void,
) {
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
      onPairGone,
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

/** The partner ended the pair: stop, clean up here, keep the message to show. */
function createEndByPartner(
  { database }: Platform,
  { pairs, consent, disconnect }: Dependencies,
  registry: HandlerRegistry,
  stop: () => void,
) {
  return async () => {
    stop();
    await clearPairLocally({ database, registry, pairs, consent });
    await disconnect.markByPartner();
  };
}

/** Ends the pair here and finishes the closing of its mailbox, also later. */
function createClosing(
  platform: Platform,
  deps: Dependencies,
  e: Engine,
  stopScheduler: () => void,
) {
  const { database } = platform;
  const { pairs, consent } = deps;
  const closing = {
    database,
    engine: e.engine,
    createTransport: async (pairMailboxId: string) => {
      const credentials = await deps.identity.credentials();
      const { createSocket } = platform;
      if (credentials === null || !createSocket) {
        throw new Error("There is no way to reach the relay");
      }
      return createRelayTransport({
        client: deps.client(credentials),
        pairMailboxId,
        createSocket,
      });
    },
  };
  const retry = createClosingRetry({ finish: () => finishClosing(closing) });
  return {
    retry,
    disconnect: async () => {
      const clearPair = { database, registry: e.registry, pairs, consent };
      try {
        await disconnectPair({ ...closing, pairs, clearPair, stopScheduler });
      } finally {
        retry.run();
      }
    },
  };
}

/** Re-evaluates the conditions and asks for a run when the inputs change. */
function subscribe(
  { consent, profiles, pairs, pause }: Dependencies,
  reevaluate: () => void,
  requestSync: () => void,
) {
  pairs.subscribe(reevaluate);
  consent.onSaved(reevaluate);
  consent.onChange(() => {
    reevaluate();
    requestSync();
  });
  profiles.subscribe(requestSync);
  pause.subscribe(requestSync);
}

function build(platform: Platform): SyncController {
  const deps = createDependencies(platform);
  const e = createEngine(platform, deps);
  const { registry } = e;
  const sessions = createSessions(platform, deps, e, () => {
    console.warn(PAIR_GONE_MESSAGE);
    endByPartner().catch(() => {
      console.warn(CLEANUP_FAILED_MESSAGE);
    });
  });
  const endByPartner = createEndByPartner(platform, deps, registry, () => {
    sessions.stop();
  });
  registry.register(createPairHandler({ onDisconnect: endByPartner }));
  const closing = createClosing(platform, deps, e, sessions.stop);
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

  subscribe(deps, reevaluate, sessions.requestSync);

  const set = (change: Partial<Conditions>) => () => {
    Object.assign(state, change);
    reevaluate();
  };
  return {
    setActive: (active) => {
      set({ active })();
      if (active) closing.retry.run();
    },
    disconnect: closing.disconnect,
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
