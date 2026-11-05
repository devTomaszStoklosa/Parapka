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
    hooks: {
      // Error messages can quote the request body (e.g. a JSON.parse failure),
      // so an entry that carries an error gets a fixed message.
      logMethod(args, method) {
        const [first] = args;
        if (typeof first === "object" && first !== null && "err" in first) {
          method.apply(this, [first, "request error"] as unknown as typeof args);
          return;
        }
        method.apply(this, args);
      },
    },
    serializers: {
      // Only safe fields; no message, stack or other enumerable properties.
      err: ((error: { name?: string; code?: string; statusCode?: number }) => ({
        type: error.name,
        code: error.code,
        statusCode: error.statusCode,
      })) as never,
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
