import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { parseAllowedOrigins } from "./cors.js";
import { MemoryStore } from "./store/memory-store.js";

const ORIGIN = "http://localhost:8081";
const FOREIGN = "http://evil.example";
let app: FastifyInstance;

function build(allowedOrigins: string[]): FastifyInstance {
  app = buildApp({
    store: new MemoryStore(),
    clock: { nowMs: () => 0 },
    allowedOrigins,
  });
  return app;
}

afterEach(async () => {
  await app.close();
});

function preflight(origin: string) {
  return app.inject({
    method: "OPTIONS",
    url: "/v1/devices",
    headers: { origin, "access-control-request-method": "POST" },
  });
}

describe("CORS", () => {
  it("answers the preflight of an allowed origin", async () => {
    build([ORIGIN]);
    const response = await preflight(ORIGIN);
    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(ORIGIN);
    expect(response.headers["access-control-allow-methods"]).toBe(
      "GET, POST, PUT, DELETE",
    );
    expect(response.headers["access-control-allow-headers"]).toBe(
      "Content-Type, X-Device-Id, X-Challenge-Id, X-Signature",
    );
  });

  it("adds the origin to a normal response", async () => {
    const response = await build([ORIGIN]).inject({
      method: "GET",
      url: "/health",
      headers: { origin: ORIGIN },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(ORIGIN);
  });

  it("gives an origin outside the list no CORS headers", async () => {
    build([ORIGIN]);
    const response = await preflight(FOREIGN);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers["access-control-allow-methods"]).toBeUndefined();
    const normal = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: FOREIGN },
    });
    expect(normal.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("sends no CORS headers when the list is empty", async () => {
    build([]);
    const response = await preflight(ORIGIN);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("parses the list of origins", () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins("")).toEqual([]);
    expect(parseAllowedOrigins(" http://a , http://b,,")).toEqual([
      "http://a",
      "http://b",
    ]);
  });
});
