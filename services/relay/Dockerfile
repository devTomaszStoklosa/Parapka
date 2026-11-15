# Relay image for linux/arm64 and linux/amd64. Build from the repository root:
#   docker build -f services/relay/Dockerfile .
FROM node:22-slim

WORKDIR /app

# Manifests first, so the dependency layer is cached. npm ci validates the lock
# file against every workspace, so all manifests are copied.
COPY package.json package-lock.json ./
COPY apps/mobile/package.json apps/mobile/
COPY packages/content/package.json packages/content/
COPY packages/crypto/package.json packages/crypto/
COPY packages/domain/package.json packages/domain/
COPY packages/protocol/package.json packages/protocol/
COPY packages/sync/package.json packages/sync/
COPY services/relay/package.json services/relay/

# tsx is a devDependency of the relay, so dev dependencies stay installed.
RUN npm ci --ignore-scripts -w @parapka/relay

COPY packages/domain packages/domain
COPY packages/protocol packages/protocol
COPY services/relay services/relay

RUN mkdir /data && chown node:node /data
VOLUME /data

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    RELAY_DB_PATH=/data/relay.db

USER node
EXPOSE 3000
WORKDIR /app/services/relay
CMD ["npm", "start"]
