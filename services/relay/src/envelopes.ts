import {
  ENVELOPE_TTL_MS,
  MAX_ENVELOPE_BYTES,
  validateEnvelope,
  type AckResponse,
  type FetchEnvelopesResponse,
  type SendEnvelopeResponse,
} from "@parapka/protocol";
import type { Clock } from "@parapka/domain";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { authenticate } from "./auth.js";
import {
  createRateLimiter,
  DEFAULT_REQUESTS_PER_WINDOW,
} from "./rate-limit.js";
import type { RelayStore } from "./store/store.js";

/** Most envelopes one fetch returns; `nextCursor` leads to the rest. */
export const FETCH_PAGE_SIZE = 100;

// The envelope is at most 64 KB; the rest of the body is a thin wrapper.
const BODY_LIMIT_BYTES = 2 * MAX_ENVELOPE_BYTES;

type Limiter = ReturnType<typeof createRateLimiter>;
type PairRequest = FastifyRequest<{ Params: { id: string } }>;

/** Deletes the envelopes received 30 days ago or earlier (spec 7.4). */
export function purgeExpiredEnvelopes(
  store: RelayStore,
  clock: Clock,
): Promise<number> {
  return store.deleteEnvelopesReceivedBefore(clock.nowMs() - ENVELOPE_TTL_MS);
}

function field(body: unknown, name: string): unknown {
  return typeof body === "object" && body !== null
    ? (body as Record<string, unknown>)[name]
    : undefined;
}

/** Size of the value as UTF-8 JSON; 0 for a value JSON cannot encode. */
function jsonBytes(value: unknown): number {
  const json: unknown = JSON.stringify(value);
  return typeof json === "string" ? Buffer.byteLength(json, "utf8") : 0;
}

/** Sends 403 unless the authenticated device belongs to the mailbox. */
async function requireMember(
  app: FastifyInstance,
  request: PairRequest,
  reply: FastifyReply,
): Promise<FastifyReply | undefined> {
  const mailbox = await app.relay.store.getMailbox(request.params.id);
  const deviceId = request.deviceId;
  // An unknown mailbox looks like a foreign one: the relay does not tell
  // which mailboxes exist.
  if (
    mailbox === null ||
    (mailbox.deviceIdA !== deviceId && mailbox.deviceIdB !== deviceId)
  ) {
    return reply.code(403).send({ error: "forbidden" });
  }
  return undefined;
}

function sendEnvelope(app: FastifyInstance, limiter: Limiter): void {
  app.post<{ Params: { id: string } }>(
    "/v1/pairs/:id/envelopes",
    {
      bodyLimit: BODY_LIMIT_BYTES,
      preHandler: [
        authenticate,
        limiter,
        (request, reply) => requireMember(app, request, reply),
      ],
    },
    async (request, reply) => {
      const { store, clock } = app.relay;
      const raw = field(request.body, "envelope");
      if (jsonBytes(raw) > MAX_ENVELOPE_BYTES) {
        return reply.code(413).send({ error: "envelope too large" });
      }
      const checked = validateEnvelope(raw);
      if (!checked.ok) {
        return reply
          .code(400)
          .send({ error: "invalid envelope", details: checked.errors });
      }
      const envelope = checked.value;
      if (envelope.senderDeviceId !== request.deviceId) {
        return reply.code(400).send({ error: "senderDeviceId mismatch" });
      }
      if (envelope.pairMailboxId !== request.params.id) {
        return reply.code(400).send({ error: "pairMailboxId mismatch" });
      }
      const { accepted } = await store.addEnvelope(envelope, clock.nowMs());
      return reply.code(accepted ? 201 : 200).send({
        envelopeId: envelope.envelopeId,
        accepted,
      } satisfies SendEnvelopeResponse);
    },
  );
}

function fetchEnvelopes(app: FastifyInstance, limiter: Limiter): void {
  app.get<{ Params: { id: string }; Querystring: { after?: string } }>(
    "/v1/pairs/:id/envelopes",
    {
      preHandler: [
        authenticate,
        limiter,
        (request, reply) => requireMember(app, request, reply),
      ],
    },
    async (request, reply) => {
      const after = request.query.after;
      if (after !== undefined && !/^\d{1,15}$/.test(after)) {
        return reply.code(400).send({ error: "invalid cursor" });
      }
      const stored = await app.relay.store.listEnvelopes(
        request.params.id,
        after ?? null,
        FETCH_PAGE_SIZE,
        request.deviceId as string,
      );
      return reply.code(200).send({
        envelopes: stored,
        nextCursor: stored.at(-1)?.cursor ?? null,
      } satisfies FetchEnvelopesResponse);
    },
  );
}

function acknowledge(app: FastifyInstance, limiter: Limiter): void {
  app.post<{ Params: { id: string } }>(
    "/v1/pairs/:id/acks",
    {
      preHandler: [
        authenticate,
        limiter,
        (request, reply) => requireMember(app, request, reply),
      ],
    },
    async (request, reply) => {
      const ids = field(request.body, "envelopeIds");
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
        return reply.code(400).send({ error: "invalid envelopeIds" });
      }
      // Only the envelopes of the partner can be acknowledged.
      const deleted = await app.relay.store.deleteEnvelopes(
        request.params.id,
        ids as string[],
        request.deviceId as string,
      );
      return reply.code(200).send({ deleted } satisfies AckResponse);
    },
  );
}

/** Registers the envelope routes. */
export function registerEnvelopeRoutes(app: FastifyInstance): void {
  const { clock, requestsPerWindow } = app.relay;
  const limiter = createRateLimiter(
    clock,
    requestsPerWindow ?? DEFAULT_REQUESTS_PER_WINDOW,
  );
  sendEnvelope(app, limiter);
  fetchEnvelopes(app, limiter);
  acknowledge(app, limiter);
}
