import type { Clock } from "@parapka/domain";
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";
import { registerCors } from "./cors.js";
import { registerEnvelopeRoutes } from "./envelopes.js";
import { registerDeviceRoutes } from "./devices.js";
import { registerInvitationRoutes } from "./invitations.js";
import { registerNotifyRoutes, type PingScheduler } from "./notify.js";
import type { PushSender } from "./push.js";
import type { RelayStore } from "./store/store.js";

export interface AppDependencies {
  readonly store: RelayStore;
  readonly clock: Clock;
  /** Requests a device may send per minute; defaults to 120. */
  readonly requestsPerWindow?: number;
  /** Sends pushes without content; without it the relay sends none. */
  readonly pushSender?: PushSender;
  /** Schedules the WebSocket pings; tests inject it, defaults to a timer. */
  readonly pingScheduler?: PingScheduler;
  /** Fastify logger options (see logging.ts); without it nothing is logged. */
  readonly logger?: FastifyServerOptions["logger"];
  /** Origins a browser may call from (CORS); without them the relay sends no CORS headers. */
  readonly allowedOrigins?: readonly string[];
}

/** Builds the relay application; it does not listen on a port. */
export function buildApp(deps: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: deps.logger ?? false });
  // The domain endpoints, added later, read the store and the clock from here.
  app.decorate("relay", deps);
  app.decorateRequest("rawBody", null);
  app.decorateRequest("deviceId", null);
  // Keeps the raw bytes: the request signature covers their hash.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (request, body: Buffer, done) => {
      request.rawBody = body;
      if (body.length === 0) {
        done(null, undefined);
        return;
      }
      try {
        done(null, JSON.parse(body.toString("utf8")));
      } catch {
        done(Object.assign(new Error("invalid JSON"), { statusCode: 400 }));
      }
    },
  );
  registerCors(app, deps.allowedOrigins ?? []);
  app.get("/health", () => ({ status: "ok" }));
  registerDeviceRoutes(app);
  registerInvitationRoutes(app);
  registerNotifyRoutes(app);
  registerEnvelopeRoutes(app);
  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    relay: AppDependencies;
  }
}
