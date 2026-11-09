import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { parseAllowedOrigins } from "./cors.js";
import { MemoryStore } from "./store/memory-store.js";

const ALLOWED = "http://localhost:8081";
let current: FastifyInstance | undefined;

function build(allowedOrigins: string[]): FastifyInstance {
  const built = buildApp({
    store: new MemoryStore(),
    clock: { nowMs: () => 0 },
    allowedOrigins,
  });
  current = built;
  return built;
}

afterEach(async () => {
  await current?.close();
});

function preflight(app: FastifyInstance, origin: string) {
  return app.inject({
    method: "OPTIONS",
    url: "/v1/pairs/p1/envelopes",
    headers: {
      origin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "x-device-id,x-signature",
    },
  });
}

describe("parseAllowedOrigins", () => {
  it("splits, trims and drops empty entries", () => {
    expect(parseAllowedOrigins(" http://a.test , ,http://b.test,")).toEqual([
      "http://a.test",
      "http://b.test",
    ]);
  });

  it("returns nothing for an empty or missing value", () => {
    expect(parseAllowedOrigins("")).toEqual([]);
    expect(parseAllowedOrigins(undefined)).toEqual([]);
  });
});

describe("CORS", () => {
  it("answers the preflight of an allowed origin", async () => {
    const app = build([ALLOWED]);
    const response = await preflight(app, ALLOWED);
    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(ALLOWED);
    expect(response.headers["vary"]).toContain("Origin");
    expect(response.headers["access-control-allow-methods"]).toBe(
      "GET, POST, PUT, DELETE",
    );
    expect(response.headers["access-control-allow-headers"]).toBe(
      "Content-Type, X-Device-Id, X-Challenge-Id, X-Signature",
    );
  });

  it("marks a normal response of an allowed origin", async () => {
    const app = build([ALLOWED]);
    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: ALLOWED },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(ALLOWED);
  });

  it("gives an origin outside the list no CORS headers", async () => {
    const app = build([ALLOWED]);
    const response = await preflight(app, "http://evil.test");
    expect(
      Object.keys(response.headers).filter((h) =>
        h.startsWith("access-control"),
      ),
    ).toEqual([]);
    const normal = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://evil.test" },
    });
    expect(normal.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("sends no CORS headers when the list is empty", async () => {
    const app = build([]);
    const response = await preflight(app, ALLOWED);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers["access-control-allow-methods"]).toBeUndefined();
  });
});
