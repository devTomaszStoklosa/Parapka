import type { FastifyServerOptions } from "fastify";

/**
 * The request log holds the method, the route pattern (e.g.
 * `/v1/pairs/:id/ws`, never the actual path with its ids or query), the
 * status and the duration only. Bodies, headers (signature, device id), push tokens
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
          method.apply(this, [
            first,
            "request error",
          ] as unknown as typeof args);
          return;
        }
        // Fastify's 404 message quotes the raw method, path and query.
        if (
          typeof args[0] === "string" &&
          /^Route .* not found$/.test(args[0])
        ) {
          method.apply(this, ["route not found"] as unknown as typeof args);
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
      req: (request: {
        method?: string;
        is404?: boolean;
        routeOptions?: { url?: string };
      }) => ({
        method: request.method,
        // An unmatched request has no route pattern; its raw URL is never logged.
        url:
          request.is404 === true
            ? "unmatched"
            : (request.routeOptions?.url ?? "unmatched"),
      }),
      res: (reply: { statusCode?: number }) => ({
        statusCode: reply.statusCode,
      }),
    },
  };
}
