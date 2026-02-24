#!/bin/bash
set -e

cd /app

CONFIG_ROOT="/config"
LEGACY_DATA_DIR="/app/data"
LEGACY_LOG_DIR="/app/logs"
BUNDLED_DATA_DIR="/app/bundled-data"

CONFIG_MOUNTED=0
LEGACY_DATA_MOUNTED=0
LEGACY_LOG_MOUNTED=0
if grep -q " ${CONFIG_ROOT} " /proc/mounts 2>/dev/null; then
  CONFIG_MOUNTED=1
fi
if grep -q " ${LEGACY_DATA_DIR} " /proc/mounts 2>/dev/null; then
  LEGACY_DATA_MOUNTED=1
fi
if grep -q " ${LEGACY_LOG_DIR} " /proc/mounts 2>/dev/null; then
  LEGACY_LOG_MOUNTED=1
fi

DEFAULT_DATA_DIR="${CONFIG_ROOT}/data"
DEFAULT_LOG_DIR="${CONFIG_ROOT}/logs"
DEFAULT_INDEXER_DEFINITIONS_PATH="${DEFAULT_DATA_DIR}/indexers/definitions"
DEFAULT_EXTERNAL_LISTS_PRESETS_PATH="${DEFAULT_DATA_DIR}/external-lists/presets"

DATA_DIR="${DATA_DIR:-${DEFAULT_DATA_DIR}}"
LOG_DIR="${LOG_DIR:-${DEFAULT_LOG_DIR}}"
if [ "$DATA_DIR" = "${CONFIG_ROOT}/data" ] && [ "$LOG_DIR" = "${CONFIG_ROOT}/logs" ]; then
  if [ "$CONFIG_MOUNTED" != "1" ] && { [ "$LEGACY_DATA_MOUNTED" = "1" ] || [ "$LEGACY_LOG_MOUNTED" = "1" ]; }; then
    echo "Legacy data/log mounts detected under /app; using legacy paths for this run."
    echo "Mount ${CONFIG_ROOT} alongside /app/data and /app/logs for one run to migrate."
    DATA_DIR="$LEGACY_DATA_DIR"
    LOG_DIR="$LEGACY_LOG_DIR"
  fi
fi

if [ -z "${INDEXER_DEFINITIONS_PATH:-}" ] || [ "$INDEXER_DEFINITIONS_PATH" = "$DEFAULT_INDEXER_DEFINITIONS_PATH" ]; then
  INDEXER_DEFINITIONS_PATH="${DATA_DIR}/indexers/definitions"
fi
if [ -z "${EXTERNAL_LISTS_PRESETS_PATH:-}" ] || [ "$EXTERNAL_LISTS_PRESETS_PATH" = "$DEFAULT_EXTERNAL_LISTS_PRESETS_PATH" ]; then
  EXTERNAL_LISTS_PRESETS_PATH="${DATA_DIR}/external-lists/presets"
fi
INDEXER_CUSTOM_DEFINITIONS_PATH="${INDEXER_CUSTOM_DEFINITIONS_PATH:-${INDEXER_DEFINITIONS_PATH}/custom}"
EXTERNAL_LISTS_CUSTOM_PRESETS_PATH="${EXTERNAL_LISTS_CUSTOM_PRESETS_PATH:-${EXTERNAL_LISTS_PRESETS_PATH}/custom}"
export DATA_DIR LOG_DIR INDEXER_DEFINITIONS_PATH EXTERNAL_LISTS_PRESETS_PATH \
  INDEXER_CUSTOM_DEFINITIONS_PATH EXTERNAL_LISTS_CUSTOM_PRESETS_PATH

# camoufox-js resolves install path from os.homedir(), so force HOME into /config/cache
HOME="${CONFIG_ROOT}/cache/home"
export HOME
CAMOUFOX_CACHE_DIR="${HOME}/.cache/camoufox"
CAMOUFOX_NOTICE_FILE="${CONFIG_ROOT}/README-DO-NOT-DELETE-CAMOUFOX-CACHE.txt"
export CAMOUFOX_PATH="$CAMOUFOX_CACHE_DIR"

has_contents() {
  [ -d "$1" ] && [ -n "$(ls -A "$1" 2>/dev/null)" ]
}

migrate_dir() {
  local src="$1"
  local dest="$2"
  local label="$3"

  if [ "$src" = "$dest" ]; then
    return 0
  fi

  if has_contents "$src"; then
    if [ ! -d "$dest" ] || [ -z "$(ls -A "$dest" 2>/dev/null)" ]; then
      echo "Migrating ${label} from ${src} to ${dest}..."
      mkdir -p "$dest"
      if ! cp -a "$src"/. "$dest"/; then
        echo "ERROR: Failed to migrate ${label} to ${dest}"
        echo "Ensure the container can read ${src} and write to ${dest}."
        echo "If needed, rerun once as root (user: 0:0) and set PUID/PGID."
        exit 1
      fi
    else
      echo "Skipping ${label} migration; destination already has data."
    fi
  fi
}

write_camoufox_notice() {
  if ! cat > "$CAMOUFOX_NOTICE_FILE" <<EOF
Cinephage Camoufox Cache (Do Not Delete)
=========================================

This instance uses Camoufox browser files for captcha solving.
Deleting the "cache" folder will force a full Camoufox redownload and may break captcha solving until it finishes.

Active paths:
- ${CAMOUFOX_CACHE_DIR}


If cleanup is required:
1. Stop Cinephage
2. Remove the cache folder
3. Start Cinephage and wait for Camoufox download to complete in logs
EOF
  then
    echo "Warning: Failed to write Camoufox cache notice at ${CAMOUFOX_NOTICE_FILE}"
  fi
}

if [ "$(id -u)" = "0" ] && [ -z "${CINEPHAGE_REEXEC:-}" ]; then
  TARGET_UID="${PUID:-1000}"
  TARGET_GID="${PGID:-1000}"

  echo "Configuring runtime UID/GID: ${TARGET_UID}:${TARGET_GID}"

  # Keep startup deterministic and avoid mutating system users/groups.
  # We run as numeric UID:GID with gosu instead of editing /etc/passwd.
  if ! [[ "$TARGET_UID" =~ ^[0-9]+$ ]] || ! [[ "$TARGET_GID" =~ ^[0-9]+$ ]]; then
    echo "ERROR: PUID and PGID must be numeric values."
    echo "  Received: PUID='${TARGET_UID}', PGID='${TARGET_GID}'"
    exit 1
  fi

  # Create all necessary directories before dropping privileges
  mkdir -p \
    "$DATA_DIR" \
    "$LOG_DIR" \
    "$INDEXER_DEFINITIONS_PATH" \
    "$EXTERNAL_LISTS_PRESETS_PATH" \
    "$INDEXER_CUSTOM_DEFINITIONS_PATH" \
    "$EXTERNAL_LISTS_CUSTOM_PRESETS_PATH" \
    "$CAMOUFOX_CACHE_DIR"

  if [ "$CONFIG_MOUNTED" = "1" ]; then
    migrate_dir "$LEGACY_DATA_DIR" "$DATA_DIR" "data"
    migrate_dir "$LEGACY_LOG_DIR" "$LOG_DIR" "logs"
  elif has_contents "$LEGACY_DATA_DIR" || has_contents "$LEGACY_LOG_DIR"; then
    echo "Warning: legacy /app data/logs detected but ${CONFIG_ROOT} is not mounted."
    echo "Mount ${CONFIG_ROOT} and keep legacy mounts for one run to migrate."
  fi

  echo "Setting ownership on application directories..."
  chown -R "$TARGET_UID:$TARGET_GID" "$CONFIG_ROOT" 2>/dev/null || true
  # Exclude node_modules — owned by root, never written to at runtime,
  # and walking it on every boot adds meaningful startup latency
  find /app -mindepth 1 -maxdepth 1 -not -name 'node_modules' \
    -exec chown -R "$TARGET_UID:$TARGET_GID" {} +

  export CINEPHAGE_REEXEC=1
  exec gosu "${TARGET_UID}:${TARGET_GID}" "$0" "$@"
fi

if [ "$(id -u)" != "0" ] && [ -z "${CINEPHAGE_REEXEC:-}" ] && [ "$CONFIG_MOUNTED" = "1" ]; then
  migrate_dir "$LEGACY_DATA_DIR" "$DATA_DIR" "data"
  migrate_dir "$LEGACY_LOG_DIR" "$LOG_DIR" "logs"
fi

echo "Running as UID=$(id -u) GID=$(id -g)"

check_permissions() {
  local dir="$1"
  local name="$2"

  if [ ! -d "$dir" ]; then
    if ! mkdir -p "$dir" 2>/dev/null; then
      echo "ERROR: Cannot create $name directory at $dir"
      echo ""
      echo "Container is running as UID=$(id -u) GID=$(id -g)"
      echo ""
      echo "To fix this, ensure the host directory has correct ownership:"
      echo "  sudo chown -R $(id -u):$(id -g) $(dirname "$dir")"
      echo ""
      echo "Or set PUID and PGID to match your host user ('id -u' and 'id -g')."
      exit 1
    fi
  fi

  if ! touch "$dir/.write-test" 2>/dev/null; then
    echo "ERROR: Cannot write to $name directory at $dir"
    echo ""
    echo "Container is running as UID=$(id -u) GID=$(id -g)"
    echo "Directory ownership: $(ls -ld "$dir")"
    echo ""
    echo "To fix this, update the host directory ownership:"
    echo "  sudo chown -R $(id -u):$(id -g) $dir"
    echo ""
    echo "Or set PUID and PGID to match your host user ('id -u' and 'id -g')."
    exit 1
  fi
  rm -f "$dir/.write-test"
}

echo "Checking directory permissions..."
check_permissions "$DATA_DIR" "data"
check_permissions "$LOG_DIR" "logs"
check_permissions "$INDEXER_DEFINITIONS_PATH" "indexer definitions"
check_permissions "$EXTERNAL_LISTS_PRESETS_PATH" "external list presets"
echo "Directory permissions OK"

write_camoufox_notice

sync_bundled_data() {
  local src="$1"
  local dest="$2"
  local label="$3"

  if [ "$src" = "$dest" ]; then
    return 0
  fi

  if [ -d "$src" ]; then
    mkdir -p "$dest"
    if ! cp -a "$src"/. "$dest"/; then
      echo "Warning: Failed to sync ${label} into ${dest}"
    fi
  else
    echo "Warning: Bundled ${label} directory not found at ${src}"
  fi
}

sync_bundled_data "$BUNDLED_DATA_DIR/indexers" "$DATA_DIR/indexers" "indexers"
sync_bundled_data "$BUNDLED_DATA_DIR/external-lists" "$DATA_DIR/external-lists" "external lists"

mkdir -p "$INDEXER_CUSTOM_DEFINITIONS_PATH" "$EXTERNAL_LISTS_CUSTOM_PRESETS_PATH"

# Download Camoufox into HOME-backed cache under /config so it persists across container recreates
CAMOUFOX_MARKER="$CAMOUFOX_CACHE_DIR/version.json"

if [ ! -f "$CAMOUFOX_MARKER" ]; then
  echo "Downloading Camoufox (first run only, ~80MB)..."
  mkdir -p "$CAMOUFOX_CACHE_DIR"

  if ! HOME="$HOME" ./node_modules/.bin/camoufox-js fetch; then
    echo "Warning: Failed to download Camoufox browser. Captcha solving will be unavailable."
  fi
else
  echo "Camoufox already installed at $CAMOUFOX_CACHE_DIR"
fi

echo "Starting Cinephage..."
exec "$@"
