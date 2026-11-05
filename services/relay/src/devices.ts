import { randomBytes } from "node:crypto";
import type {
  RegisterDeviceResponse,
  SetPushTokenRequest,
  SetPushTokenResponse,
} from "@parapka/protocol";
import type { FastifyInstance } from "fastify";
import { authenticate, CHALLENGE_TTL_MS, importPublicKey } from "./auth.js";

export interface ChallengeResponse {
  readonly challengeId: string;
  /** 32 random bytes, base64url. */
  readonly nonce: string;
  readonly expiresAt: number;
}

function randomId(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function registerDevice(app: FastifyInstance): void {
  app.post("/v1/devices", async (request, reply) => {
    const body: unknown = request.body;
    const key = isObject(body) ? body["signingPublicKey"] : undefined;
    if (typeof key !== "string" || importPublicKey(key) === null) {
      return reply.code(400).send({ error: "invalid signingPublicKey" });
    }
    const { store, clock } = app.relay;
    const deviceId = randomId(16);
    await store.putDevice({
      deviceId,
      signingPublicKey: key,
      createdAtMs: clock.nowMs(),
    });
    return reply.code(201).send({ deviceId } satisfies RegisterDeviceResponse);
  });
}

function issueChallenge(app: FastifyInstance): void {
  app.post<{ Params: { id: string } }>(
    "/v1/devices/:id/challenges",
    async (request, reply) => {
      const { store, clock } = app.relay;
      const deviceId = request.params.id;
      if ((await store.getDevice(deviceId)) === null) {
        return reply.code(404).send({ error: "unknown device" });
      }
      const challenge = {
        challengeId: randomId(16),
        deviceId,
        nonce: randomId(32),
        expiresAtMs: clock.nowMs() + CHALLENGE_TTL_MS,
      };
      await store.putChallenge(challenge);
      return reply.code(201).send({
        challengeId: challenge.challengeId,
        nonce: challenge.nonce,
        expiresAt: challenge.expiresAtMs,
      } satisfies ChallengeResponse);
    },
  );
}

function setPushToken(app: FastifyInstance): void {
  app.put<{ Params: { id: string } }>(
    "/v1/devices/:id/push-token",
    { preHandler: authenticate },
    async (request, reply) => {
      if (request.deviceId !== request.params.id) {
        return reply.code(403).send({ error: "forbidden" });
      }
      const body: unknown = request.body;
      const platform = isObject(body) ? body["platform"] : undefined;
      const token = isObject(body) ? body["pushToken"] : undefined;
      if (
        (platform !== "apns" && platform !== "fcm") ||
        typeof token !== "string" ||
        token.length === 0
      ) {
        return reply.code(400).send({ error: "invalid body" });
      }
      const push: SetPushTokenRequest = { platform, pushToken: token };
      await app.relay.store.setPushToken(request.params.id, {
        platform: push.platform,
        token: push.pushToken,
      });
      return reply.code(200).send({} satisfies SetPushTokenResponse);
    },
  );
}

/** Registers the device, challenge and push-token routes. */
export function registerDeviceRoutes(app: FastifyInstance): void {
  registerDevice(app);
  issueChallenge(app);
  setPushToken(app);
}
