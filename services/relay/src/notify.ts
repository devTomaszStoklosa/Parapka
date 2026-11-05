import websocket from "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { authenticate } from "./auth.js";
import { requireMember } from "./envelopes.js";
import { SYNC_MARKER } from "./push.js";

// The sockets of the connected devices; a device may have several.
type Sockets = Map<string, Set<WebSocket>>;

export interface Notifier {
  /** Tells the partner of the sender that there are new envelopes. */
  notifyPartner(mailboxId: string, senderDeviceId: string): Promise<void>;
}

async function pushTo(app: FastifyInstance, partnerId: string): Promise<void> {
  const { store, pushSender } = app.relay;
  if (pushSender === undefined) return;
  const push = (await store.getDevice(partnerId))?.push;
  if (push === null || push === undefined) return;
  try {
    await pushSender.send(push, SYNC_MARKER);
  } catch (error) {
    // A failed push must not fail the request that stored the envelope.
    // Only the message: the error object may carry the push token.
    const reason = error instanceof Error ? error.message : "unknown error";
    app.log.warn({ reason }, "push failed");
  }
}

async function notifyPartner(
  app: FastifyInstance,
  sockets: Sockets,
  mailboxId: string,
  senderDeviceId: string,
): Promise<void> {
  const mailbox = await app.relay.store.getMailbox(mailboxId);
  if (mailbox === null) return;
  const partnerId =
    mailbox.deviceIdA === senderDeviceId
      ? mailbox.deviceIdB
      : mailbox.deviceIdA;
  const connected = sockets.get(partnerId);
  if (connected !== undefined && connected.size > 0) {
    for (const socket of connected) socket.send(SYNC_MARKER);
    return;
  }
  await pushTo(app, partnerId);
}

/** Registers the WebSocket route and the notifier of new envelopes. */
export function registerNotifyRoutes(app: FastifyInstance): void {
  const sockets: Sockets = new Map();
  app.decorate("notifier", {
    notifyPartner: (mailboxId, senderDeviceId) =>
      notifyPartner(app, sockets, mailboxId, senderDeviceId),
  } satisfies Notifier);
  void app.register(websocket);
  // Registered after the plugin, so the route may use `websocket: true`.
  void app.register((instance) => {
    instance.get<{ Params: { id: string } }>(
      "/v1/pairs/:id/ws",
      {
        websocket: true,
        // A failing hook answers over HTTP, before the upgrade.
        preHandler: [
          authenticate,
          (request, reply) => requireMember(app, request, reply),
        ],
      },
      (socket, request) => {
        const deviceId = request.deviceId as string;
        const own = sockets.get(deviceId) ?? new Set();
        own.add(socket);
        sockets.set(deviceId, own);
        socket.on("close", () => {
          own.delete(socket);
          if (own.size === 0 && sockets.get(deviceId) === own) {
            sockets.delete(deviceId);
          }
        });
      },
    );
    return Promise.resolve();
  });
}

declare module "fastify" {
  interface FastifyInstance {
    notifier: Notifier;
  }
}
