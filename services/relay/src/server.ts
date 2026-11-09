import { buildApp } from "./app.js";
import { parseAllowedOrigins } from "./cors.js";
import { purgeClosedMailboxes, purgeExpiredEnvelopes } from "./envelopes.js";
import { loggerOptions } from "./logging.js";
import { purgeTechnicalData } from "./retention.js";
import { SqliteStore } from "./store/sqlite-store.js";

const port = Number(process.env["PORT"] ?? 3000);
const host = process.env["HOST"] ?? "0.0.0.0";
const databasePath = process.env["RELAY_DB_PATH"] ?? "relay.db";

const store = new SqliteStore(databasePath);
const clock = { nowMs: () => Date.now() };
const allowedOrigins = parseAllowedOrigins(
  process.env["RELAY_ALLOWED_ORIGINS"],
);
const app = buildApp({
  store,
  clock,
  logger: loggerOptions(),
  allowedOrigins,
});

const PURGE_INTERVAL_MS = 60 * 60 * 1000;
const purgeTimer = setInterval(() => {
  purgeExpiredEnvelopes(store, clock).catch((error: unknown) => {
    app.log.error(error, "purging expired envelopes failed");
  });
  purgeClosedMailboxes(store, clock).catch((error: unknown) => {
    app.log.error(error, "purging closed mailboxes failed");
  });
  purgeTechnicalData(store, clock).catch((error: unknown) => {
    app.log.error(error, "purging technical data failed");
  });
}, PURGE_INTERVAL_MS);

app.addHook("onClose", () => {
  clearInterval(purgeTimer);
  store.close();
});

await app.listen({ port, host });
