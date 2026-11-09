import type { FastifyInstance } from "fastify";

const ALLOWED_METHODS = "GET, POST, PUT, DELETE";
const ALLOWED_HEADERS =
  "Content-Type, X-Device-Id, X-Challenge-Id, X-Signature";
const PREFLIGHT_MAX_AGE_SECONDS = "600";

/** Parses the comma separated list of allowed origins; empty entries are dropped. */
export function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Answers browsers (CORS) for the listed origins only. An origin outside the
 * list, or an empty list, gets no CORS headers at all.
 */
export function registerCors(
  app: FastifyInstance,
  allowedOrigins: readonly string[],
): void {
  if (allowedOrigins.length === 0) return;
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin === undefined || !allowedOrigins.includes(origin)) return;
    void reply.header("Access-Control-Allow-Origin", origin);
    void reply.header("Vary", "Origin");
    const preflight =
      request.method === "OPTIONS" &&
      request.headers["access-control-request-method"] !== undefined;
    if (!preflight) return;
    void reply.header("Access-Control-Allow-Methods", ALLOWED_METHODS);
    void reply.header("Access-Control-Allow-Headers", ALLOWED_HEADERS);
    void reply.header("Access-Control-Max-Age", PREFLIGHT_MAX_AGE_SECONDS);
    await reply.code(204).send();
  });
}
