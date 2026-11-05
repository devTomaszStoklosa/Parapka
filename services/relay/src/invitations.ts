import { randomBytes } from "node:crypto";
import type {
  AcceptInvitationResponse,
  CreateInvitationResponse,
  FetchInvitationKeysResponse,
} from "@parapka/protocol";
import type { FastifyInstance } from "fastify";
import { authenticate } from "./auth.js";
import type { InvitationRecord } from "./store/store.js";

/** An invitation is valid for 24 hours (spec 7.3). */
export const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;

function randomId(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

function createInvitation(app: FastifyInstance): void {
  app.post(
    "/v1/invitations",
    { preHandler: authenticate },
    async (request, reply) => {
      const { store, clock } = app.relay;
      const deviceId = request.deviceId as string;
      if ((await store.findMailboxByDevice(deviceId)) !== null) {
        return reply.code(409).send({ error: "device is already paired" });
      }
      const invitationId = randomId(16);
      const expiresAtMs = clock.nowMs() + INVITATION_TTL_MS;
      await store.putInvitation({
        invitationId,
        deviceId,
        expiresAtMs,
        acceptedByDeviceId: null,
        encryptedKeysB: null,
      });
      return reply.code(201).send({
        invitationId,
        expiresAt: new Date(expiresAtMs).toISOString(),
      } satisfies CreateInvitationResponse);
    },
  );
}

/** The status and message that refuse an acceptance, or null when allowed. */
async function refusal(
  app: FastifyInstance,
  invitation: InvitationRecord,
  deviceId: string,
): Promise<{ status: number; error: string } | null> {
  const { store, clock } = app.relay;
  if (
    invitation.acceptedByDeviceId !== null ||
    invitation.expiresAtMs <= clock.nowMs()
  ) {
    return { status: 410, error: "invitation is used or expired" };
  }
  if (invitation.deviceId === deviceId) {
    return { status: 403, error: "own invitation" };
  }
  if (
    (await store.findMailboxByDevice(deviceId)) !== null ||
    (await store.findMailboxByDevice(invitation.deviceId)) !== null
  ) {
    return { status: 409, error: "device is already paired" };
  }
  return null;
}

function encryptedKeysOf(body: unknown): string | null {
  const keys =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)["encryptedKeys"]
      : undefined;
  return typeof keys === "string" && keys.length > 0 ? keys : null;
}

function acceptInvitation(app: FastifyInstance): void {
  app.post<{ Params: { id: string } }>(
    "/v1/invitations/:id/accept",
    { preHandler: authenticate },
    async (request, reply) => {
      const { store, clock } = app.relay;
      const deviceId = request.deviceId as string;
      const keys = encryptedKeysOf(request.body);
      if (keys === null) {
        return reply.code(400).send({ error: "invalid encryptedKeys" });
      }
      const invitation = await store.getInvitation(request.params.id);
      if (invitation === null) {
        return reply.code(404).send({ error: "unknown invitation" });
      }
      const refused = await refusal(app, invitation, deviceId);
      if (refused !== null) {
        return reply.code(refused.status).send({ error: refused.error });
      }
      const pairMailboxId = randomId(16);
      const accepted = await store.acceptInvitation(
        invitation.invitationId,
        deviceId,
        keys,
        {
          pairMailboxId,
          deviceIdA: invitation.deviceId,
          deviceIdB: deviceId,
          createdAtMs: clock.nowMs(),
        },
      );
      if (accepted === "used") {
        return reply.code(410).send({ error: "invitation is used or expired" });
      }
      if (accepted === "paired") {
        return reply.code(409).send({ error: "device is already paired" });
      }
      // The relay keeps no separate pair record: the pair is its mailbox.
      return reply.code(200).send({
        pairId: pairMailboxId,
        pairMailboxId,
      } satisfies AcceptInvitationResponse);
    },
  );
}

function fetchKeys(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>(
    "/v1/invitations/:id/keys",
    { preHandler: authenticate },
    async (request, reply) => {
      const invitation = await app.relay.store.getInvitation(request.params.id);
      if (invitation === null) {
        return reply.code(404).send({ error: "unknown invitation" });
      }
      if (invitation.deviceId !== request.deviceId) {
        return reply.code(403).send({ error: "forbidden" });
      }
      if (
        invitation.acceptedByDeviceId === null ||
        invitation.encryptedKeysB === null
      ) {
        return reply.code(404).send({ error: "invitation not accepted" });
      }
      return reply.code(200).send({
        encryptedKeys: invitation.encryptedKeysB,
        acceptedByDeviceId: invitation.acceptedByDeviceId,
      } satisfies FetchInvitationKeysResponse);
    },
  );
}

/** Registers the invitation routes. */
export function registerInvitationRoutes(app: FastifyInstance): void {
  createInvitation(app);
  acceptInvitation(app);
  fetchKeys(app);
}
