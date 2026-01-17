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

# Download Camoufox browser if not already present
# This is done at runtime to reduce image size and allow updates
CAMOUFOX_CACHE_DIR="/home/node/.cache/camoufox"
CAMOUFOX_MARKER="$CAMOUFOX_CACHE_DIR/version.json"
if [ ! -f "$CAMOUFOX_MARKER" ]; then
  echo "Downloading Camoufox browser (first run only, ~80MB)..."
  mkdir -p "$CAMOUFOX_CACHE_DIR"
  if ./node_modules/.bin/camoufox-js fetch; then
    echo "Camoufox browser installed successfully"
    touch "$CAMOUFOX_MARKER"
  else
    echo "Warning: Failed to download Camoufox browser. Captcha solving will be unavailable."
  fi
else
  echo "Camoufox browser already installed"
fi

echo "Starting Cinephage..."
exec "$@"
