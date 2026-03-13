# ==========================================
# Build Stage
# ==========================================
FROM node:24-trixie-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
	python3 \
	make \
	g++ \
	&& rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY .npmrc ./

ENV NODE_OPTIONS="--max-old-space-size=4096"

RUN npm ci

COPY src ./src
COPY static ./static
COPY data ./data
COPY scripts/fix-tv-subtitle-paths.js scripts/reset-admin-password.js ./scripts/
COPY server.js svelte.config.js tsconfig.json vite.config.ts ./

ARG APP_VERSION=dev

RUN npm run build && npm prune --omit=dev

# ==========================================
# Runtime Stage
# ==========================================
FROM node:24-trixie-slim AS runner
WORKDIR /app

ARG APP_VERSION=dev
ARG APP_SOURCE=https://github.com/MoldyTaint/Cinephage
ARG VCS_REF=unknown
ARG BUILD_CREATED=unknown
ENV APP_VERSION=${APP_VERSION}

LABEL org.opencontainers.image.title='Cinephage' \
	org.opencontainers.image.description='Self-hosted media management application' \
	org.opencontainers.image.source="${APP_SOURCE}" \
	org.opencontainers.image.revision="${VCS_REF}" \
	org.opencontainers.image.created="${BUILD_CREATED}" \
	org.opencontainers.image.version="${APP_VERSION}"

RUN apt-get update && apt-get install -y --no-install-recommends \
	wget \
	ffmpeg \
	gosu \
	libgtk-3-0 \
	libx11-xcb1 \
	libasound2 \
	xvfb \
	&& rm -rf /var/lib/apt/lists/*

# Runtime does not need npm tooling; remove to shrink attack surface and CVE footprint.
RUN rm -rf /usr/local/lib/node_modules/npm \
	&& rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

# Pre-create config directories; ownership is fixed at runtime by entrypoint
RUN mkdir -p /config/data /config/logs /config/cache

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/data ./bundled-data
COPY --chmod=755 docker-entrypoint.sh ./docker-entrypoint.sh
COPY --chmod=755 docker-script-runner.sh /usr/local/bin/cinephage-script
RUN ln -sf /usr/local/bin/cinephage-script /usr/local/bin/cine-run

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    FFPROBE_PATH=/usr/bin/ffprobe \
    DATA_DIR=/config/data \
    LOG_DIR=/config/logs \
    INDEXER_DEFINITIONS_PATH=/config/data/indexers/definitions \
    EXTERNAL_LISTS_PRESETS_PATH=/config/data/external-lists/presets

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:$PORT/api/health" || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
