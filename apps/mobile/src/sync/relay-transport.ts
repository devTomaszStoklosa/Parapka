import type { RelayClient } from "../net/relay-client";
import {
  connectRelaySocket,
  type RelaySocketOptions,
} from "../net/relay-socket";
import type { SyncTransport } from "./transport";

export interface RelayTransportOptions {
  readonly client: RelayClient;
  readonly pairMailboxId: string;
  readonly createSocket: RelaySocketOptions["createSocket"];
  readonly setTimer?: RelaySocketOptions["setTimer"];
  readonly clearTimer?: RelaySocketOptions["clearTimer"];
}

/** The transport of the sync engine over the relay mailbox of the pair. */
export function createRelayTransport(
  options: RelayTransportOptions,
): SyncTransport {
  const { client, pairMailboxId } = options;
  return {
    send: async (envelope) => {
      await client.sendEnvelope(pairMailboxId, envelope);
    },
    fetch: (after) => client.fetchEnvelopes(pairMailboxId, after),
    ack: async (envelopeIds) => {
      await client.ack(pairMailboxId, envelopeIds);
    },
    onNotify: (listener) => {
      const socket = connectRelaySocket({
        url: () => client.webSocketUrl(pairMailboxId),
        createSocket: options.createSocket,
        onSync: listener,
        ...(options.setTimer === undefined
          ? {}
          : { setTimer: options.setTimer }),
        ...(options.clearTimer === undefined
          ? {}
          : { clearTimer: options.clearTimer }),
      });
      return () => {
        socket.close();
      };
    },
  };
}
