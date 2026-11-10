import type { LocalDatabase } from "./local-database";

export interface ChangeChannel {
  subscribe: (listener: () => void) => () => void;
  notify: () => void;
}

const registry = new WeakMap<LocalDatabase, Map<string, ChangeChannel>>();

// Repositories on the same database share a channel, so one instance sees the
// writes of another.
export function changeChannel(db: LocalDatabase, name: string): ChangeChannel {
  let channels = registry.get(db);
  if (!channels) {
    channels = new Map();
    registry.set(db, channels);
  }
  let channel = channels.get(name);
  if (!channel) {
    const listeners = new Set<() => void>();
    channel = {
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      notify: () => {
        for (const listener of [...listeners]) listener();
      },
    };
    channels.set(name, channel);
  }
  return channel;
}
