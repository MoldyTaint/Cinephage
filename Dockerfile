# ==========================================
# Build Stage
# ==========================================
FROM node:22-alpine3.21 AS builder

WORKDIR /app

# Install build tools required for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy package files first to leverage Docker cache
COPY package*.json ./

# Install all dependencies (including devDependencies for building)
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the SvelteKit application
RUN npm run build

# ==========================================
# Runtime Stage
# ==========================================
FROM node:22-alpine3.21 AS runner

WORKDIR /app

# Install runtime dependencies
# ffmpeg is required for ffprobe media analysis
RUN apk add --no-cache ffmpeg

# Create necessary directories for data and logs with correct permissions
RUN mkdir -p data logs && chown -R node:node /app

# Copy production dependencies and built artifacts from builder
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/build ./build
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/drizzle ./drizzle
COPY --from=builder --chown=node:node /app/drizzle.config.ts ./drizzle.config.ts
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
ENV BROWSER_SOLVER_ENABLED=false

# Switch to non-root user
USER node

# Expose the application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the application
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "build/index.js"]
