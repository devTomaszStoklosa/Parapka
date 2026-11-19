import { defineConfig } from "@playwright/test";

// Ports other than the development ones, so a running dev setup is not reused.
const relayPort = 3100;
const webPort = 8100;
const relayUrl = `http://localhost:${String(relayPort)}`;
const webUrl = `http://localhost:${String(webPort)}`;

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  outputDir: "test-results",
  reporter: [["list"], ["html", { open: "never" }]],
  use: { trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { channel: "chromium" } }],
  webServer: [
    {
      // A new in-memory database on every start: no state between runs.
      command: "npm run dev -w @parapka/relay",
      url: `${relayUrl}/health`,
      env: {
        PORT: String(relayPort),
        HOST: "127.0.0.1",
        RELAY_DB_PATH: ":memory:",
        RELAY_ALLOWED_ORIGINS: webUrl,
      },
      reuseExistingServer: !process.env["CI"],
    },
    {
      command: "npm run web:build -w @parapka/mobile && tsx e2e/serve-web.ts",
      url: webUrl,
      env: { EXPO_PUBLIC_RELAY_URL: relayUrl, PORT: String(webPort) },
      timeout: 180_000,
      reuseExistingServer: !process.env["CI"],
    },
  ],
});
