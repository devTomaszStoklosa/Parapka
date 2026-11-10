import { describe, expect, it } from "vitest";

import { createHandlerRegistry, type SyncHandler } from "./handler-registry";

function handler(entity: string): SyncHandler {
  return {
    entity,
    category: null,
    apply: () => Promise.resolve(),
    collect: () => Promise.resolve([]),
  };
}

describe("HandlerRegistry", () => {
  it("finds a registered handler by entity", () => {
    const registry = createHandlerRegistry();
    const chore = handler("Chore");
    registry.register(chore);
    expect(registry.get("Chore")).toBe(chore);
    expect(registry.get("Other")).toBeUndefined();
  });

  it("lists handlers in the order of registration", () => {
    const registry = createHandlerRegistry();
    registry.register(handler("B"));
    registry.register(handler("A"));
    expect(registry.all().map((h) => h.entity)).toEqual(["B", "A"]);
  });

  it("throws on a second handler of the same entity", () => {
    const registry = createHandlerRegistry();
    registry.register(handler("Chore"));
    expect(() => {
      registry.register(handler("Chore"));
    }).toThrow("Chore");
    expect(registry.all()).toHaveLength(1);
  });
});
