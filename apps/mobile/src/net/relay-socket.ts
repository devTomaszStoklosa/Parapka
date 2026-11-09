/** The part of the WebSocket API the client uses. */
export interface SocketLike {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  close(): void;
}

export interface RelaySocketOptions {
  /** A fresh URL with credentials for every connection (a challenge is single use). */
  readonly url: () => Promise<string>;
  readonly createSocket: (url: string) => SocketLike;
  /** Called on every `sync` message. */
  readonly onSync: () => void;
  readonly setTimer?: (callback: () => void, ms: number) => unknown;
  readonly clearTimer?: (timer: unknown) => void;
}

export interface RelaySocket {
  /** Stops reconnecting and closes the connection. */
  close(): void;
}

export const INITIAL_RECONNECT_MS = 1_000;
export const MAX_RECONNECT_MS = 30_000;

interface State {
  stopped: boolean;
  delay: number;
  socket: SocketLike | null;
  timer: unknown;
}

function attach(
  options: RelaySocketOptions,
  state: State,
  current: SocketLike,
  reconnect: () => void,
): void {
  current.onopen = () => {
    state.delay = INITIAL_RECONNECT_MS;
  };
  current.onmessage = (event) => {
    if (event.data === "sync") options.onSync();
  };
  current.onclose = () => {
    if (state.socket === current) state.socket = null;
    reconnect();
  };
  current.onerror = () => {
    // A `close` event follows; it schedules the reconnect.
  };
}

/** Keeps a connection to the relay open, reconnecting with a growing delay. */
export function connectRelaySocket(options: RelaySocketOptions): RelaySocket {
  const setTimer =
    options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer =
    options.clearTimer ??
    ((timer) => {
      clearTimeout(timer as ReturnType<typeof setTimeout>);
    });
  const state: State = {
    stopped: false,
    delay: INITIAL_RECONNECT_MS,
    socket: null,
    timer: null,
  };

  function reconnect(): void {
    if (state.stopped || state.timer !== null) return;
    const wait = state.delay;
    state.delay = Math.min(state.delay * 2, MAX_RECONNECT_MS);
    state.timer = setTimer(() => {
      state.timer = null;
      void connect();
    }, wait);
  }

  async function connect(): Promise<void> {
    let url: string;
    try {
      url = await options.url();
    } catch {
      reconnect();
      return;
    }
    if (state.stopped) return;
    state.socket = options.createSocket(url);
    attach(options, state, state.socket, reconnect);
  }

  void connect();

  return {
    close: () => {
      state.stopped = true;
      if (state.timer !== null) clearTimer(state.timer);
      state.timer = null;
      state.socket?.close();
      state.socket = null;
    },
  };
}
