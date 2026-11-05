import type { FastifyServerOptions } from "fastify";

/**
 * The request log holds the method, the path without the query, the status
 * and the duration only. Bodies, headers (signature, device id), push tokens
 * and the client IP are never logged (NFR-PRV-05): the IP is omitted rather
 * than shortened, because the relay limits requests per device, not per IP.
 */
export function loggerOptions(
  stream?: NodeJS.WritableStream,
): NonNullable<FastifyServerOptions["logger"]> {
  return {
    level: "info",
    // The host name and process id are technical noise, not needed.
    base: null,
    ...(stream === undefined ? {} : { stream }),
    serializers: {
      req: (request: { method?: string; url?: string }) => ({
        method: request.method,
        url: (request.url ?? "").split("?")[0],
      }),
      res: (reply: { statusCode?: number }) => ({
        statusCode: reply.statusCode,
      }),
    },
  };
}
