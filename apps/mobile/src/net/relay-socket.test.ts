import { expect, it, vi } from "vitest";
import { connectRelaySocket, type SocketLike } from "./relay-socket";

class FakeSocket implements SocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string) {}
  close() {
    this.closed = true;
  }
}

function setup(urlFails = false) {
  const sockets: FakeSocket[] = [];
  const delays: number[] = [];
  let pending: (() => void) | null = null;
  const onSync = vi.fn();
  const clearTimer = vi.fn();
  let calls = 0;
  const relay = connectRelaySocket({
    url: () => {
      calls += 1;
      return urlFails && calls === 1
        ? Promise.reject(new Error("offline"))
        : Promise.resolve(`wss://x/ws?n=${String(calls)}`);
    },
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    onSync,
    setTimer: (callback, ms) => {
      delays.push(ms);
      pending = callback;
      return "timer";
    },
    clearTimer,
  });
  const fire = async () => {
    const callback = pending;
    pending = null;
    callback?.();
    await vi.waitFor(() => {
      expect(calls).toBeGreaterThan(0);
    });
  };
  return { relay, sockets, delays, onSync, clearTimer, fire };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

it("connects and calls back on sync only", async () => {
  const { sockets, onSync } = setup();
  await tick();
  sockets[0]?.onmessage?.({ data: "other" });
  expect(onSync).not.toHaveBeenCalled();
  sockets[0]?.onmessage?.({ data: "sync" });
  expect(onSync).toHaveBeenCalledTimes(1);
});

it("reconnects with a doubling delay capped at 30 s", async () => {
  const { sockets, delays, fire } = setup();
  await tick();
  for (let i = 0; i < 7; i += 1) {
    sockets[i]?.onerror?.();
    sockets[i]?.onclose?.();
    await fire();
    await tick();
  }
  expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  expect(sockets[1]?.url).not.toBe(sockets[0]?.url);
});

it("resets the delay after a successful open", async () => {
  const { sockets, delays, fire } = setup();
  await tick();
  sockets[0]?.onclose?.();
  await fire();
  await tick();
  sockets[1]?.onopen?.();
  sockets[1]?.onclose?.();
  expect(delays).toEqual([1000, 1000]);
  await fire();
});

it("retries when the URL cannot be built", async () => {
  const { sockets, delays, fire } = setup(true);
  await tick();
  expect(delays).toEqual([1000]);
  await fire();
  await tick();
  expect(sockets).toHaveLength(1);
});

it("stops after close()", async () => {
  const { relay, sockets, delays, clearTimer } = setup();
  await tick();
  sockets[0]?.onclose?.();
  relay.close();
  expect(clearTimer).toHaveBeenCalledWith("timer");
  sockets[0]?.onclose?.();
  expect(delays).toEqual([1000]);
  const open = setup();
  await tick();
  open.relay.close();
  expect(open.sockets[0]?.closed).toBe(true);
  open.sockets[0]?.onclose?.();
  expect(open.delays).toEqual([]);
});

it("uses the global timers by default", async () => {
  vi.useFakeTimers();
  try {
    const sockets: FakeSocket[] = [];
    const relay = connectRelaySocket({
      url: () => Promise.resolve("wss://relay.test/ws"),
      createSocket: (url) => {
        const socket = new FakeSocket(url);
        sockets.push(socket);
        return socket;
      },
      onSync: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]?.onclose?.();
    sockets[0]?.onclose?.();
    relay.close();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sockets).toHaveLength(1);
  } finally {
    vi.useRealTimers();
  }
});

it("does not open a socket when closed while the URL is pending", async () => {
  const { relay, sockets } = setup();
  relay.close();
  await tick();
  expect(sockets).toHaveLength(0);
});
