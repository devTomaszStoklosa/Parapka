import type { Clock } from "@parapka/domain";
import type { FastifyReply, FastifyRequest } from "fastify";

/** Requests a device may send in one window, unless configured otherwise. */
export const DEFAULT_REQUESTS_PER_WINDOW = 120;

/** Length of the fixed window of the rate limit. */
export const RATE_LIMIT_WINDOW_MS = 60 * 1000;

/**
 * Pre-handler that limits the requests per device in fixed windows counted by
 * the clock; the excess gets 429. It runs after `authenticate`.
 */
export function createRateLimiter(
  clock: Clock,
  limit: number,
  windowMs: number = RATE_LIMIT_WINDOW_MS,
): (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<FastifyReply | undefined> {
  let window = -1;
  let counts = new Map<string, number>();
  return async (request, reply) => {
    const current = Math.floor(clock.nowMs() / windowMs);
    if (current !== window) {
      // A new window forgets the old counts, so the map does not grow.
      window = current;
      counts = new Map();
    }
    const deviceId = request.deviceId as string;
    const count = (counts.get(deviceId) ?? 0) + 1;
    counts.set(deviceId, count);
    if (count > limit) {
      return reply.code(429).send({ error: "too many requests" });
    }
    return undefined;
  };
}
