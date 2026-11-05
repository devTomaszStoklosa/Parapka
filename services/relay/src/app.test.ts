import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStore } from "./store/memory-store.js";

describe("buildApp", () => {
  it("answers GET /health with 200 without listening on a port", async () => {
    const app = buildApp({
      store: new MemoryStore(),
      clock: { nowMs: () => 1_700_000_000_000 },
    });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    await app.close();
  });
});
