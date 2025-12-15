#!/bin/sh
set -e

# Copy bundled indexers if data/indexers is empty or missing
INDEXER_DIR="data/indexers"
BUNDLED_DIR="/app/bundled-indexers"

if [ -d "$BUNDLED_DIR" ]; then
  if [ ! -d "$INDEXER_DIR" ] || [ -z "$(ls -A "$INDEXER_DIR" 2>/dev/null)" ]; then
    echo "Initializing indexer definitions from bundled files..."
    cp -r "$BUNDLED_DIR" "$INDEXER_DIR"
  fi
fi

# Run database migrations
npm run db:push

# Execute the main command
exec "$@"
