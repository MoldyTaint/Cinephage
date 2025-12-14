# ==========================================
# Build Stage
# ==========================================
FROM node:22-alpine AS builder

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
FROM node:22-alpine AS runner

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
# Copy internal indexer definitions if they exist in data/indexers/definitions in source
COPY --from=builder --chown=node:node /app/data/indexers ./data/indexers

# Set environment variables
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
# Tell Cinephage where to find ffprobe (Alpine installs it here)
ENV FFPROBE_PATH=/usr/bin/ffprobe

# Switch to non-root user
USER node

# Expose the application port
EXPOSE 3000

# Start the application
CMD ["/bin/sh", "-c", "npm run db:push && node build/index.js"]
