// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PlatformProvider, usePlatform } from "./context";
import { createWebPlatform } from "./web";

afterEach(cleanup);

function Probe() {
  return <span>{String(usePlatform().clock.nowMs())}</span>;
}

it("gives the platform to components below the provider", async () => {
  const platform = await createWebPlatform();
  vi.spyOn(platform.clock, "nowMs").mockReturnValue(42);
  render(
    <PlatformProvider platform={platform}>
      <Probe />
    </PlatformProvider>,
  );
  expect(screen.getByText("42")).toBeTruthy();
});

it("creates a complete web platform", async () => {
  const platform = await createWebPlatform();
  expect(platform.sodium.randomBytes(8)).toHaveLength(8);
  await platform.keyStore.set("k", Uint8Array.of(7));
  expect(await platform.keyStore.get("k")).toEqual(Uint8Array.of(7));
  expect(platform.clock.nowMs()).toBeGreaterThan(0);
  await platform.database.put("test", "a", { n: 1 });
  expect(await platform.database.get("test", "a")).toEqual({ n: 1 });
});

it("throws outside a provider", () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  expect(() => render(<Probe />)).toThrow(/PlatformProvider/);
  vi.restoreAllMocks();
});
