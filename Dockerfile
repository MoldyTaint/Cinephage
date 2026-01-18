# ==========================================
# Build Stage
# ==========================================
FROM node:22-slim AS builder

WORKDIR /app

# Install build tools required for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files first to leverage Docker cache
COPY package*.json ./

# Install all dependencies (including devDependencies for building)
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the SvelteKit application
RUN npm run build

# Download Camoufox browser at build time (avoids runtime permission issues)
# Set HOME to /app so camoufox caches to /app/.cache/camoufox
ENV HOME=/app
RUN mkdir -p /app/.cache && npx camoufox-js fetch

# ==========================================
# Runtime Stage
# ==========================================
FROM node:22-slim AS runner

WORKDIR /app

# Install runtime dependencies:
# - ffmpeg: for ffprobe media analysis
# - Camoufox browser dependencies (Firefox/GTK libs)
# - wget: for health check
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    wget \
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
    && rm -rf /var/lib/apt/lists/*

# Create necessary directories with correct ownership (node user is UID 1000)
RUN mkdir -p data logs && chown -R node:node data logs

# Set HOME to /app for consistent cache location regardless of runtime UID
# This ensures camoufox-js finds the browser at /app/.cache/camoufox
ENV HOME=/app

# Copy pre-downloaded Camoufox browser from builder
COPY --from=builder --chown=node:node /app/.cache ./.cache

# Copy production dependencies and built artifacts from builder
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/build ./build
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/server.js ./server.js
COPY --from=builder --chown=node:node /app/src ./src

# Copy bundled indexers to separate location (not shadowed by volume mount)
COPY --from=builder --chown=node:node /app/data/indexers ./bundled-indexers

# Copy and set up entrypoint script
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Set environment variables
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV FFPROBE_PATH=/usr/bin/ffprobe

# Expose the application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

# Run as non-root user (rootless) - node user is UID 1000
USER node

# Start the application
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
