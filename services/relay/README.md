# Relay

HTTP service with the envelope and mailbox store (spec 7.1, 7.4).

## Running locally

```sh
RELAY_DB_PATH=relay.db RELAY_ALLOWED_ORIGINS=http://localhost:8081 npm run dev -w @parapka/relay
```

`npm run dev` runs `src/server.ts` with `tsx`, so no build step is needed.

| Variable | Meaning | Default |
|---|---|---|
| `PORT` | Port to listen on | `3000` |
| `HOST` | Address to listen on | `0.0.0.0` |
| `RELAY_DB_PATH` | Path of the SQLite database file | `relay.db` |
| `RELAY_ALLOWED_ORIGINS` | Browser origins allowed by CORS, separated by commas; empty means no CORS | empty |

A browser WebSocket cannot set headers, so `/v1/pairs/{id}/ws` also accepts the
query parameters `deviceId`, `challengeId` and `signature`. The signed URL is
the path with the query without these three parameters.
