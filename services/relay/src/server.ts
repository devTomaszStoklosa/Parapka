import { buildApp } from "./app.js";
import { SqliteStore } from "./store/sqlite-store.js";

const port = Number(process.env["PORT"] ?? 3000);
const host = process.env["HOST"] ?? "0.0.0.0";
const databasePath = process.env["RELAY_DB_PATH"] ?? "relay.db";

const store = new SqliteStore(databasePath);
const app = buildApp({ store, clock: { nowMs: () => Date.now() } });

app.addHook("onClose", () => {
  store.close();
});

await app.listen({ port, host });
