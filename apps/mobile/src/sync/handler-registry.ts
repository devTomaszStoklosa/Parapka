import type { ContentChange } from "@parapka/protocol";

import type { ConsentCategory } from "../consent/consent-model";

/** Gives a handler the timestamp (text form) of a local change. */
export type NextHlc = () => string;

/** Sync of one entity type; a new panel adds a handler (spec 7.2). */
export interface SyncHandler {
  /** Name of the entity in the content of an envelope. */
  readonly entity: string;
  /** Consent category of the data; null when the data needs no consent. */
  readonly category: ConsentCategory | null;
  /** Applies a change of the partner to the local database; repeats are harmless. */
  apply(change: ContentChange): Promise<void>;
  /** Takes the local changes not sent yet, stamped with `nextHlc`. */
  collect(nextHlc: NextHlc): Promise<readonly ContentChange[]>;
  /**
   * Called after the envelope with the collected changes is saved in the
   * queue; a handler marks its changes as sent here, not in `collect`.
   */
  committed?(): Promise<void>;
  /**
   * Reports the local changes of the entity; the wiring asks for a
   * synchronization on each one. Returns the function that stops listening.
   */
  subscribe?(listener: () => void): () => void;
  /** Removes the data received from the partner (the pair is over). */
  forgetReceived?(): Promise<void>;
  /** Marks the shared items as private; the copies stay (A13). */
  disconnected?(): Promise<void>;
}

export interface HandlerRegistry {
  /** Throws when a handler of the same entity is already registered. */
  register(handler: SyncHandler): void;
  get(entity: string): SyncHandler | undefined;
  all(): readonly SyncHandler[];
}

export function createHandlerRegistry(): HandlerRegistry {
  const handlers = new Map<string, SyncHandler>();
  return {
    register: (handler) => {
      if (handlers.has(handler.entity)) {
        throw new Error(`Handler for ${handler.entity} is already registered`);
      }
      handlers.set(handler.entity, handler);
    },
    get: (entity) => handlers.get(entity),
    all: () => [...handlers.values()],
  };
}
