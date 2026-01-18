#!/bin/sh
set -e

# Ensure we're in the app directory
cd /app

# Copy bundled indexers if definitions directory is empty or missing
# Use absolute paths to avoid working directory issues
DEFINITIONS_DIR="/app/data/indexers/definitions"
BUNDLED_DIR="/app/bundled-indexers"

if [ -d "$BUNDLED_DIR" ]; then
  # Check if definitions directory is missing or empty
  if [ ! -d "$DEFINITIONS_DIR" ] || [ -z "$(ls -A "$DEFINITIONS_DIR" 2>/dev/null)" ]; then
    echo "Initializing indexer definitions from bundled files..."
    # Create parent directories if needed
    mkdir -p /app/data/indexers
    # Copy contents of bundled-indexers to data/indexers
    cp -r "$BUNDLED_DIR"/* /app/data/indexers/
    echo "Copied $(ls -1 "$DEFINITIONS_DIR" 2>/dev/null | wc -l) indexer definitions"
  else
    echo "Indexer definitions already present ($(ls -1 "$DEFINITIONS_DIR" | wc -l) files)"
  fi
else
  echo "Warning: Bundled indexers directory not found at $BUNDLED_DIR"
fi

# Verify Camoufox browser is present (downloaded at build time)
# HOME is set to /app in Dockerfile, so cache is at /app/.cache/camoufox
CAMOUFOX_MARKER="$HOME/.cache/camoufox/version.json"
if [ -f "$CAMOUFOX_MARKER" ]; then
  echo "Camoufox browser ready"
else
  # Fallback: attempt runtime download if somehow missing
  echo "Warning: Camoufox browser not found, attempting download..."
  mkdir -p "$HOME/.cache/camoufox"
  if ./node_modules/.bin/camoufox-js fetch; then
    echo "Camoufox browser installed successfully"
  else
    echo "Warning: Failed to download Camoufox browser. Captcha solving will be unavailable."
  fi
fi

echo "Starting Cinephage..."
exec "$@"
