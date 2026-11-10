import type { Envelope } from "@parapka/protocol";
import { expect, it, vi } from "vitest";

import type { RelayClient } from "../net/relay-client";
import type { SocketLike } from "../net/relay-socket";
import { createRelayTransport } from "./relay-transport";

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

const envelope: Envelope = {
  envelopeId: "e1",
  pairMailboxId: "mailbox",
  senderDeviceId: "d1",
  protocolVersion: 1,
  nonce: "AAAA",
  ciphertext: "AAAA",
};

function setup() {
  const client = {
    sendEnvelope: vi.fn(() => Promise.resolve({ accepted: true })),
    fetchEnvelopes: vi.fn(() =>
      Promise.resolve({ envelopes: [], nextCursor: null }),
    ),
    ack: vi.fn(() => Promise.resolve({ deleted: 1 })),
    webSocketUrl: vi.fn(() => Promise.resolve("wss://relay/ws?x=1")),
  };
  const sockets: FakeSocket[] = [];
  const transport = createRelayTransport({
    client: client as unknown as RelayClient,
    pairMailboxId: "mailbox",
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
  });
  return { client, sockets, transport };
}

it("delegates to the client with the mailbox of the pair", async () => {
  const { client, transport } = setup();
  await transport.send(envelope);
  expect(client.sendEnvelope).toHaveBeenCalledWith("mailbox", envelope);
  expect(await transport.fetch("5")).toEqual({
    envelopes: [],
    nextCursor: null,
  });
  expect(client.fetchEnvelopes).toHaveBeenCalledWith("mailbox", "5");
  await transport.ack(["e1"]);
  expect(client.ack).toHaveBeenCalledWith("mailbox", ["e1"]);
});

it("notifies on a sync message and closes the socket", async () => {
  const { client, sockets, transport } = setup();
  const listener = vi.fn();
  const stop = transport.onNotify(listener);
  await vi.waitFor(() => {
    expect(sockets).toHaveLength(1);
  });
  expect(client.webSocketUrl).toHaveBeenCalledWith("mailbox");
  expect(sockets[0]?.url).toBe("wss://relay/ws?x=1");
  sockets[0]?.onmessage?.({ data: "sync" });
  expect(listener).toHaveBeenCalledTimes(1);
  stop();
  expect(sockets[0]?.closed).toBe(true);
});

it("passes the injected timers to the socket", async () => {
  const setTimer = vi.fn(() => "timer");
  const clearTimer = vi.fn();
  const client = {
    webSocketUrl: vi.fn(() => Promise.reject(new Error("offline"))),
  };
  const transport = createRelayTransport({
    client: client as unknown as RelayClient,
    pairMailboxId: "mailbox",
    createSocket: (url) => new FakeSocket(url),
    setTimer,
    clearTimer,
  });
  const stop = transport.onNotify(() => undefined);
  await vi.waitFor(() => {
    expect(setTimer).toHaveBeenCalledTimes(1);
  });
  stop();
  expect(clearTimer).toHaveBeenCalledWith("timer");
});
