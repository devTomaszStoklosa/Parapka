# Relay

HTTP and WebSocket service with the envelope and mailbox store (spec §7.1, §7.4).

## Local run

`server.ts` imports `.ts` sources, so the `dev` script runs it with `tsx`, without a build step:

```sh
RELAY_DB_PATH=relay.db RELAY_ALLOWED_ORIGINS=http://localhost:8081 npm run dev -w @parapka/relay
```

| Variable | Meaning | Default |
|---|---|---|
| `PORT` | Port to listen on. | `3000` |
| `HOST` | Address to listen on. | `0.0.0.0` |
| `RELAY_DB_PATH` | SQLite database file. | `relay.db` |
| `RELAY_ALLOWED_ORIGINS` | Origins a browser may call from (CORS), comma separated. Empty means no CORS. | empty |

## Browser

A browser sends the `X-Device-Id`, `X-Challenge-Id` and `X-Signature` headers only after a successful CORS preflight, so the app's origin must be in `RELAY_ALLOWED_ORIGINS`.

The browser `WebSocket` API cannot set headers. The route `/v1/pairs/{id}/ws` therefore also takes the query parameters `deviceId`, `challengeId` and `signature`. The signed text is the same as for HTTP; its URL is the path with the query without these three parameters. A wrong or missing signature is answered with 401 before the upgrade. The logs hold no query.
