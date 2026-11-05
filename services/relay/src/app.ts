import type { Clock } from "@parapka/domain";
import Fastify, { type FastifyInstance } from "fastify";
import type { RelayStore } from "./store/store.js";

export interface AppDependencies {
  readonly store: RelayStore;
  readonly clock: Clock;
}

/** Builds the relay application; it does not listen on a port. */
export function buildApp(deps: AppDependencies): FastifyInstance {
  const app = Fastify();
  // The domain endpoints, added later, read the store and the clock from here.
  app.decorate("relay", deps);
  app.get("/health", () => ({ status: "ok" }));
  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    relay: AppDependencies;
  }
}
