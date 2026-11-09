import { afterEach, expect, it, vi } from "vitest";
import { configuredRelayUrl, DEFAULT_RELAY_URL } from "./relay-config";

afterEach(() => {
  vi.unstubAllEnvs();
});

it("uses the default address when none is configured", () => {
  vi.stubEnv("EXPO_PUBLIC_RELAY_URL", "");
  expect(configuredRelayUrl()).toBe(DEFAULT_RELAY_URL);
  expect(DEFAULT_RELAY_URL).toBe("http://localhost:3000");
});

it("uses the configured address", () => {
  vi.stubEnv("EXPO_PUBLIC_RELAY_URL", "https://relay.example");
  expect(configuredRelayUrl()).toBe("https://relay.example");
});
