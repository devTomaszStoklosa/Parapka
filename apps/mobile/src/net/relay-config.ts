export const DEFAULT_RELAY_URL = "http://localhost:3000";

// Expo inlines `process.env.EXPO_PUBLIC_*` at build time.
declare const process: { env: { EXPO_PUBLIC_RELAY_URL?: string } };

/** The relay address from the configuration; read once, by the composition module. */
export function configuredRelayUrl(): string {
  const value = process.env.EXPO_PUBLIC_RELAY_URL;
  return value === undefined || value === "" ? DEFAULT_RELAY_URL : value;
}
