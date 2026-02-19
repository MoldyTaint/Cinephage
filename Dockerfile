# ==========================================
# Build Stage
# ==========================================
FROM node:22-slim AS builder

WORKDIR /app

# Install build tools required for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files first to leverage Docker cache
COPY package*.json ./
COPY .npmrc ./

# Set Node.js memory limits to prevent npm memory leaks during build
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Install all dependencies (including devDependencies for building)
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build-time version for UI display (PUBLIC_ vars are embedded at build time)
ARG APP_VERSION=dev
ENV PUBLIC_APP_VERSION=${APP_VERSION}

# Build the SvelteKit application and remove devDependencies in one layer
RUN npm run build && npm prune --omit=dev

# ==========================================
# Runtime Stage
# ==========================================
FROM node:22-slim AS runner

WORKDIR /app

# Runtime version (useful for diagnostics)
ARG APP_VERSION=dev
ENV PUBLIC_APP_VERSION=${APP_VERSION}

# Install runtime dependencies:
# - ffmpeg: for ffprobe media analysis
# - Camoufox browser dependencies (Firefox/GTK libs)
# - GLX/Mesa libraries for Camoufox GPU detection (glxtest)
# - wget: for health check
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    wget \
    gosu \
    libgtk-3-0 \
    libx11-xcb1 \
    libasound2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxshmfence1 \
    libxkbcommon0 \
    fonts-liberation \
    libdbus-glib-1-2 \
    libxt6 \
    xvfb \
    libgl1-mesa-dri \
    libglx-mesa0 \
    && rm -rf /var/lib/apt/lists/*

# Create necessary directories with correct ownership (node user is UID 1000)
RUN mkdir -p /config/data /config/logs && chown -R node:node /config

# Copy production dependencies and built artifacts from builder
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/build ./build
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/server.js ./server.js

# Copy script to fix TV subtitle paths to be used with cmd 'npm run fix:tv-subtitles' - Temporary fix
COPY --from=builder --chown=node:node /app/scripts/fix-tv-subtitle-paths.js ./scripts/fix-tv-subtitle-paths.js

# Copy bundled data to separate location (not shadowed by volume mount)
COPY --from=builder --chown=node:node /app/data ./bundled-data

# Copy and set up entrypoint script
COPY --chown=node:node --chmod=755 docker-entrypoint.sh ./docker-entrypoint.sh

# Set environment variables
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    FFPROBE_PATH=/usr/bin/ffprobe \
    DATA_DIR=/config/data \
    LOG_DIR=/config/logs \
    INDEXER_DEFINITIONS_PATH=/config/data/indexers/definitions \
    EXTERNAL_LISTS_PRESETS_PATH=/config/data/external-lists/presets

# Expose the application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:$PORT/api/health || exit 1

# Start the application
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
