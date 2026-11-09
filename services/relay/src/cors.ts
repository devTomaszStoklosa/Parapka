import type { FastifyInstance } from "fastify";

const ALLOWED_METHODS = "GET, POST, PUT, DELETE";
const ALLOWED_HEADERS =
  "Content-Type, X-Device-Id, X-Challenge-Id, X-Signature";

/** Parses the comma-separated list of allowed origins; empty means no CORS. */
export function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Adds CORS headers for the listed origins and answers their preflight
 * requests; an origin outside the list gets no CORS headers.
 */
export function registerCors(
  app: FastifyInstance,
  allowedOrigins: readonly string[],
): void {
  if (allowedOrigins.length === 0) return;
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin === undefined || !allowedOrigins.includes(origin)) return;
    void reply.header("access-control-allow-origin", origin);
    void reply.header("vary", "Origin");
    if (
      request.method === "OPTIONS" &&
      request.headers["access-control-request-method"] !== undefined
    ) {
      await reply
        .header("access-control-allow-methods", ALLOWED_METHODS)
        .header("access-control-allow-headers", ALLOWED_HEADERS)
        .header("access-control-max-age", "600")
        .code(204)
        .send();
    }
  });
}
