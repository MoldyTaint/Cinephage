# Environment Variables Reference

Complete reference for all environment variables supported by Cinephage.

---

## Docker-Specific Variables

| Variable                          | Description                                             | Default                                       | Required |
| --------------------------------- | ------------------------------------------------------- | --------------------------------------------- | -------- |
| `PORT`                            | HTTP port to listen on                                  | 3000                                          | No       |
| `PUID`                            | User ID for file permissions                            | 1000                                          | No       |
| `PGID`                            | Group ID for file permissions                           | 1000                                          | No       |
| `CINEPHAGE_FORCE_RECURSIVE_CHOWN` | Force full recursive ownership fix on startup (`0`/`1`) | 0                                             | No       |
| `ORIGIN`                          | Trusted app origin / CSRF origin                        | http://localhost:3000                         | No       |
| `BETTER_AUTH_URL`                 | Better Auth callback/redirect base URL                  | Saved External URL or `http://localhost:5173` | No       |
| `TZ`                              | Timezone                                                | UTC                                           | No       |

### Example Docker Compose

```yaml
environment:
  PORT: 3000
  PUID: 1000
  PGID: 1000
  ORIGIN: http://192.168.1.100:3000
  BETTER_AUTH_URL: http://192.168.1.100:3000
  TZ: America/New_York
```

---

## Server Configuration (Manual Install)

| Variable          | Description                                | Default                                       |
| ----------------- | ------------------------------------------ | --------------------------------------------- |
| `HOST`            | Bind address                               | 0.0.0.0                                       |
| `PORT`            | HTTP port                                  | 3000                                          |
| `ORIGIN`          | Trusted app origin / CSRF origin           | http://localhost:3000                         |
| `BETTER_AUTH_URL` | Better Auth callback/redirect base URL     | Saved External URL or `http://localhost:5173` |
| `PUBLIC_BASE_URL` | Public-facing base URL for generated links | -                                             |
| `TZ`              | Timezone                                   | UTC                                           |
| `DATA_DIR`        | Database and data location                 | data                                          |

Docker image defaults:

- `DATA_DIR=/config/data`
- `INDEXER_DEFINITIONS_PATH=/config/data/indexers/definitions`

### URL Variables

Use the URL variables for different purposes:

- `ORIGIN` — trusted request origin / CSRF protection
- `BETTER_AUTH_URL` — auth callbacks, redirects, and Better Auth generated links
- `PUBLIC_BASE_URL` — public-facing links outside auth where supported

For most deployments, set `ORIGIN` and `BETTER_AUTH_URL` to the same external URL.
If `BETTER_AUTH_URL` is unset, Cinephage falls back to the saved External URL from
`Settings > System` when available, then localhost for local bootstrap.

**Values must include protocol and port when needed:**

```bash
# Good
ORIGIN=http://192.168.1.100:3000
ORIGIN=https://cinephage.example.com
BETTER_AUTH_URL=http://192.168.1.100:3000
BETTER_AUTH_URL=https://cinephage.example.com

# Bad
ORIGIN=192.168.1.100:3000      # Missing protocol
ORIGIN=http://localhost         # Won't work externally
BETTER_AUTH_URL=cinephage.example.com  # Missing protocol
```

### Better Auth Variables

| Variable                      | Description                                          | Default                                       |
| ----------------------------- | ---------------------------------------------------- | --------------------------------------------- |
| `BETTER_AUTH_URL`             | Explicit Better Auth base URL                        | Saved External URL or `http://localhost:5173` |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Comma-separated extra origins trusted by Better Auth | -                                             |
| `BETTER_AUTH_SECRET`          | Auth secret for session signing and API key crypto   | - (required)                                  |

`BETTER_AUTH_SECRET` must be explicitly set at runtime.

Generate one with any of:

- `openssl rand -base64 32`
- `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- `python3 -c "import secrets,base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"`

---

## Logging Configuration

| Variable            | Description                                       | Default                |
| ------------------- | ------------------------------------------------- | ---------------------- |
| `LOG_LEVEL`         | Minimum log level emitted to stdout               | Dev: debug, Prod: info |
| `LOG_INCLUDE_STACK` | Include stack traces in logs (`true`/`false`)     | Dev: true, Prod: false |
| `LOG_SENSITIVE`     | Disable redaction of secrets in logs (debug only) | false                  |

Logs are written to stdout/stderr. For retention, rotation, and aggregation, use your runtime platform:

- Docker: `docker logs cinephage`
- systemd: `journalctl -u cinephage`
- Kubernetes: `kubectl logs`

---

## Media Configuration

| Variable                             | Description                              | Default                            |
| ------------------------------------ | ---------------------------------------- | ---------------------------------- |
| `FFPROBE_PATH`                       | Path to ffprobe binary                   | ffprobe (in PATH)                  |
| `INDEXER_DEFINITIONS_PATH`           | Base indexer YAML definitions path       | data/indexers/definitions          |
| `INDEXER_CUSTOM_DEFINITIONS_PATH`    | Custom indexer definitions override path | data/indexers/definitions/custom   |
| `EXTERNAL_LISTS_PRESETS_PATH`        | Smart list presets base directory        | data/external-lists/presets        |
| `EXTERNAL_LISTS_CUSTOM_PRESETS_PATH` | Smart list custom presets directory      | data/external-lists/presets/custom |

### ffprobe Path

If ffprobe is not in your system PATH:

```bash
# Linux
FFPROBE_PATH=/usr/bin/ffprobe

# macOS (Homebrew)
FFPROBE_PATH=/opt/homebrew/bin/ffprobe

# Windows
FFPROBE_PATH=C:\ffmpeg\bin\ffprobe.exe
```

---

## Worker Configuration

Control background task concurrency:

| Variable                     | Description                       | Default          |
| ---------------------------- | --------------------------------- | ---------------- |
| `WORKER_MAX_STREAMS`         | Max stream extraction workers     | 10               |
| `WORKER_MAX_IMPORTS`         | Max file import workers           | 5                |
| `WORKER_MAX_SCANS`           | Max library scan workers          | 2                |
| `WORKER_MAX_MONITORING`      | Max monitoring task workers       | 5                |
| `WORKER_MAX_SEARCH`          | Max manual search workers         | 3                |
| `WORKER_MAX_SUBTITLE_SEARCH` | Max subtitle search workers       | 3                |
| `WORKER_MAX_PORTAL_SCANS`    | Max portal scan workers           | 2                |
| `WORKER_MAX_CHANNEL_SYNCS`   | Max Live TV channel sync workers  | 3                |
| `WORKER_CLEANUP_MS`          | Remove completed tasks after (ms) | 1800000 (30 min) |
| `WORKER_MAX_LOGS`            | Max log entries per worker type   | 1000             |

### Tuning Workers

**Low-memory systems:**

```bash
WORKER_MAX_STREAMS=5
WORKER_MAX_IMPORTS=3
WORKER_MAX_SCANS=1
WORKER_MAX_LOGS=500
```

**High-performance servers:**

```bash
WORKER_MAX_STREAMS=20
WORKER_MAX_IMPORTS=10
WORKER_MAX_SCANS=4
WORKER_MAX_SEARCH=5
```

---

## Streaming Configuration

| Variable                                 | Description                                      | Default             |
| ---------------------------------------- | ------------------------------------------------ | ------------------- |
| `PROXY_FETCH_TIMEOUT_MS`                 | Stream URL fetch timeout                         | 30000 (30 sec)      |
| `PROXY_SEGMENT_MAX_SIZE`                 | Max segment size (bytes)                         | 52428800 (50 MB)    |
| `PROXY_MAX_RETRIES`                      | Retry attempts for failed segments               | 2                   |
| `DEFAULT_PROXY_REFERER`                  | Default referer for stream requests              | https://videasy.net |
| `STREAMING_API_KEY_RATE_LIMIT_WINDOW_MS` | Streaming API key per-key rate limit window (ms) | 3600000 (1 hour)    |
| `STREAMING_API_KEY_RATE_LIMIT_MAX`       | Streaming API key max requests per window        | 10000               |

### Timeout Tuning

Slow providers may need longer timeouts:

```bash
# For slow connections
PROXY_FETCH_TIMEOUT_MS=60000  # 60 seconds
PROXY_MAX_RETRIES=3
```

---

## Provider Circuit Breaker

Circuit breaker protects against failing providers:

| Variable                        | Description                     | Default        |
| ------------------------------- | ------------------------------- | -------------- |
| `PROVIDER_MAX_FAILURES`         | Failures before opening circuit | 3              |
| `PROVIDER_CIRCUIT_HALF_OPEN_MS` | Test interval when half-open    | 30000 (30 sec) |
| `PROVIDER_CIRCUIT_RESET_MS`     | Time before resetting circuit   | 60000 (60 sec) |
| `PROVIDER_CACHE_TTL_MS`         | Provider result cache time      | 30000 (30 sec) |
| `PROVIDER_PARALLEL_COUNT`       | Parallel provider queries       | 3              |

### Circuit Breaker States

```
Closed (Normal)
    ↓ 3 failures
Open (Blocked)
    ↓ 60 seconds
Half-Open (Testing)
    ↓ Success
Closed (Normal)
```

---

## Live TV Configuration

| Variable               | Description                | Default        |
| ---------------------- | -------------------------- | -------------- |
| `EPG_STARTUP_GRACE_MS` | Delay EPG fetch on startup | 30000 (30 sec) |

Prevents EPG flooding on restart.

---

## Startup and Readiness Tuning

These variables help tune startup behavior in Docker/Kubernetes environments.

| Variable                                   | Description                                                           | Default |
| ------------------------------------------ | --------------------------------------------------------------------- | ------- |
| `MONITORING_STARTUP_GRACE_MINUTES`         | Delay before monitoring scheduler begins automated tasks              | 5       |
| `DOWNLOAD_MONITOR_STARTUP_SYNC_ENABLED`    | Run download-client orphan sync at startup (`true`/`false`)           | true    |
| `DOWNLOAD_MONITOR_STARTUP_SYNC_TIMEOUT_MS` | Per-client timeout for startup sync (milliseconds)                    | 10000   |
| `EXTERNAL_ID_RUN_ON_STARTUP`               | Run External ID refresh automatically during startup (`true`/`false`) | true    |

### Example (slower storage or constrained clusters)

```bash
MONITORING_STARTUP_GRACE_MINUTES=10
DOWNLOAD_MONITOR_STARTUP_SYNC_ENABLED=false
EXTERNAL_ID_RUN_ON_STARTUP=false
```

---

## Integration Runtime Tuning

These variables control post-start runtime polling, search load, and health-failure pacing.

| Variable                                        | Description                                                          | Default |
| ----------------------------------------------- | -------------------------------------------------------------------- | ------- |
| `DOWNLOAD_MONITOR_POLL_ACTIVE_MS`               | Download-client polling interval while active downloads exist        | 5000    |
| `DOWNLOAD_MONITOR_POLL_IDLE_MS`                 | Download-client polling interval while idle                          | 30000   |
| `INDEXER_SEARCH_CONCURRENCY`                    | Max concurrent indexer requests per search batch                     | 5       |
| `INDEXER_SEARCH_TIMEOUT_MS`                     | Timeout per indexer request                                          | 30000   |
| `INDEXER_FAILURES_BEFORE_DISABLE`               | Consecutive failures before auto-disabling an indexer                | 3       |
| `INDEXER_FAILURE_INCREMENT_INTERVAL_MS`         | Minimum spacing between consecutive-failure increments per indexer   | 30000   |
| `INDEXER_BACKOFF_BASE_MS`                       | Base indexer backoff duration                                        | 5000    |
| `INDEXER_BACKOFF_MAX_MS`                        | Max indexer backoff duration                                         | 60000   |
| `INDEXER_BACKOFF_MULTIPLIER`                    | Exponential backoff multiplier                                       | 2       |
| `DOWNLOAD_CLIENT_FAILURES_BEFORE_FAILING`       | Consecutive failures before download-client health becomes `failing` | 3       |
| `DOWNLOAD_CLIENT_FAILURE_INCREMENT_INTERVAL_MS` | Minimum spacing between consecutive-failure increments per client    | 30000   |

### Example (reduce integration pressure)

```bash
DOWNLOAD_MONITOR_POLL_ACTIVE_MS=10000
DOWNLOAD_MONITOR_POLL_IDLE_MS=60000
INDEXER_SEARCH_CONCURRENCY=2
INDEXER_SEARCH_TIMEOUT_MS=45000
INDEXER_FAILURES_BEFORE_DISABLE=5
INDEXER_FAILURE_INCREMENT_INTERVAL_MS=45000
DOWNLOAD_CLIENT_FAILURES_BEFORE_FAILING=5
DOWNLOAD_CLIENT_FAILURE_INCREMENT_INTERVAL_MS=45000
```

---

## Advanced Settings

| Variable           | Description                         | Default |
| ------------------ | ----------------------------------- | ------- |
| `SHUTDOWN_TIMEOUT` | Graceful shutdown timeout (seconds) | 30      |
| `PUBLIC_BASE_URL`  | Public-facing base URL              | -       |

### Shutdown Timeout

When stopping Cinephage, it waits for workers to finish:

```bash
# Fast shutdown (may interrupt tasks)
SHUTDOWN_TIMEOUT=10

# Patient shutdown (wait for long tasks)
SHUTDOWN_TIMEOUT=120
```

---

## Complete .env Example

```bash
# ============================================
# Cinephage Environment Configuration
# ============================================

# Server
PORT=3000
ORIGIN=http://192.168.1.100:3000
BETTER_AUTH_URL=http://192.168.1.100:3000
TZ=America/New_York

# Paths
DATA_DIR=data
FFPROBE_PATH=/usr/bin/ffprobe

# Logging
LOG_LEVEL=info
LOG_INCLUDE_STACK=false
LOG_SENSITIVE=false

# Workers
WORKER_MAX_STREAMS=10
WORKER_MAX_IMPORTS=5
WORKER_MAX_SCANS=2
WORKER_MAX_MONITORING=5
WORKER_MAX_SEARCH=3
WORKER_MAX_SUBTITLE_SEARCH=3
WORKER_MAX_PORTAL_SCANS=2
WORKER_MAX_CHANNEL_SYNCS=3
WORKER_CLEANUP_MS=1800000
WORKER_MAX_LOGS=1000

# Streaming
PROXY_FETCH_TIMEOUT_MS=30000
PROXY_SEGMENT_MAX_SIZE=52428800
PROXY_MAX_RETRIES=2
DEFAULT_PROXY_REFERER=https://videasy.net
STREAMING_API_KEY_RATE_LIMIT_WINDOW_MS=3600000
STREAMING_API_KEY_RATE_LIMIT_MAX=10000

# Circuit Breaker
PROVIDER_MAX_FAILURES=3
PROVIDER_CIRCUIT_HALF_OPEN_MS=30000
PROVIDER_CIRCUIT_RESET_MS=60000
PROVIDER_CACHE_TTL_MS=30000
PROVIDER_PARALLEL_COUNT=3

# Live TV
EPG_STARTUP_GRACE_MS=30000

# Startup / readiness tuning
MONITORING_STARTUP_GRACE_MINUTES=5
DOWNLOAD_MONITOR_STARTUP_SYNC_ENABLED=true
DOWNLOAD_MONITOR_STARTUP_SYNC_TIMEOUT_MS=10000
EXTERNAL_ID_RUN_ON_STARTUP=true

# Integration runtime tuning
DOWNLOAD_MONITOR_POLL_ACTIVE_MS=5000
DOWNLOAD_MONITOR_POLL_IDLE_MS=30000
INDEXER_SEARCH_CONCURRENCY=5
INDEXER_SEARCH_TIMEOUT_MS=30000
INDEXER_FAILURES_BEFORE_DISABLE=3
INDEXER_FAILURE_INCREMENT_INTERVAL_MS=30000
INDEXER_BACKOFF_BASE_MS=5000
INDEXER_BACKOFF_MAX_MS=60000
INDEXER_BACKOFF_MULTIPLIER=2
DOWNLOAD_CLIENT_FAILURES_BEFORE_FAILING=3
DOWNLOAD_CLIENT_FAILURE_INCREMENT_INTERVAL_MS=30000

# Advanced
SHUTDOWN_TIMEOUT=30
```

---

## Docker Compose Example

```yaml
services:
  cinephage:
    image: ghcr.io/moldytaint/cinephage:latest
    ports:
      - '3000:3000'
    environment:
      # Server
      ORIGIN: http://192.168.1.100:3000
      BETTER_AUTH_URL: http://192.168.1.100:3000
      TZ: America/New_York
      # Workers (tuned for 4GB RAM)
      WORKER_MAX_STREAMS: 5
      WORKER_MAX_IMPORTS: 3
      WORKER_MAX_SCANS: 1
      # Streaming
      PROXY_FETCH_TIMEOUT_MS: 60000
      STREAMING_API_KEY_RATE_LIMIT_WINDOW_MS: 3600000
      STREAMING_API_KEY_RATE_LIMIT_MAX: 10000
    volumes:
      - ./config:/config
      - /path/to/media:/media
      - /path/to/downloads:/downloads
```

Use `:latest` for the current stable release, `:dev` for preview builds, or `:vX.Y.Z` to pin a specific stable version.

---

## Environment Variable Precedence

Variables are loaded in this order (later overrides earlier):

1. **Default values** — Hardcoded application defaults
2. **.env file** — Applied only when explicitly loaded by your runtime (for example, via a library like `dotenv` when running with npm/node) or when Docker Compose uses the `env_file` directive
3. **Environment variables** — System environment variables or those passed directly via Docker Compose `environment:` section or `docker run -e`

**Note for Docker users:**

- If using `env_file: .env` in `docker-compose.yml`, Docker Compose reads the `.env` file and injects its variables into the container environment
- If passing variables directly via `environment:` in the compose file or `-e` flags in `docker run`, those take precedence over variables loaded from `.env`
- Mounting a `.env` file as a volume only makes the file available inside the container; it does **not** populate environment variables unless you also use `env_file` or explicitly load the file from your entrypoint/runtime

---

## See Also

- [Settings Reference](settings-reference.md) — UI-based settings
- [Performance Tuning](performance-tuning.md) — Optimize with env vars
- [Docker Deployment](../operations/deployment.md) — Docker-specific setup
