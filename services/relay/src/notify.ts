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

/** How often the relay pings every connection. */
export const PING_INTERVAL_MS = 30_000;

/** Runs `tick` every `intervalMs`; the returned function stops it. */
export type PingScheduler = (
  tick: () => void,
  intervalMs: number,
) => () => void;

const defaultScheduler: PingScheduler = (tick, intervalMs) => {
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
};

// A socket that did not answer the previous ping is dead: a phone in the
// background often leaves the TCP connection hanging without closing it.
function heartbeatTick(sockets: Sockets, alive: Set<WebSocket>): void {
  for (const own of sockets.values()) {
    for (const socket of own) {
      if (!alive.has(socket)) {
        // The "close" handler removes the socket from the registry.
        socket.terminate();
        continue;
      }
      alive.delete(socket);
      socket.ping();
    }
  }
}

/** Registers the WebSocket route and the notifier of new envelopes. */
export function registerNotifyRoutes(app: FastifyInstance): void {
  const sockets: Sockets = new Map();
  const alive = new Set<WebSocket>();
  const stopPings = (app.relay.pingScheduler ?? defaultScheduler)(() => {
    heartbeatTick(sockets, alive);
  }, PING_INTERVAL_MS);
  app.addHook("onClose", () => {
    stopPings();
  });
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
        alive.add(socket);
        socket.on("pong", () => alive.add(socket));
        socket.on("close", () => {
          alive.delete(socket);
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
