# Environment Variables Reference

Complete reference for all environment variables supported by Cinephage.

---

## Docker-Specific Variables

| Variable | Description                   | Default               | Required |
| -------- | ----------------------------- | --------------------- | -------- |
| `PORT`   | HTTP port to listen on        | 3000                  | No       |
| `PUID`   | User ID for file permissions  | 1000                  | No       |
| `PGID`   | Group ID for file permissions | 1000                  | No       |
| `ORIGIN` | External URL (with protocol)  | http://localhost:3000 | No       |
| `TZ`     | Timezone                      | UTC                   | No       |

### Example Docker Compose

```yaml
environment:
  PORT: 3000
  PUID: 1000
  PGID: 1000
  ORIGIN: http://192.168.1.100:3000
  TZ: America/New_York
```

---

## Server Configuration (Manual Install)

| Variable   | Description                | Default               |
| ---------- | -------------------------- | --------------------- |
| `HOST`     | Bind address               | 0.0.0.0               |
| `PORT`     | HTTP port                  | 3000                  |
| `ORIGIN`   | External URL for callbacks | http://localhost:3000 |
| `TZ`       | Timezone                   | UTC                   |
| `DATA_DIR` | Database and data location | data                  |
| `LOG_DIR`  | Log file directory         | logs                  |

Docker image defaults:

- `DATA_DIR=/config/data`
- `LOG_DIR=/config/logs`
- `INDEXER_DEFINITIONS_PATH=/config/data/indexers/definitions`

### Important: ORIGIN Variable

The `ORIGIN` variable is critical for:

- **Streaming** — Generated `.strm` files use this URL
- **Webhooks** — External services callback to this URL
- **CSRF protection** — Validates request origins

**Must include protocol and port:**

```bash
# Good
ORIGIN=http://192.168.1.100:3000
ORIGIN=https://cinephage.example.com

# Bad
ORIGIN=192.168.1.100:3000      # Missing protocol
ORIGIN=http://localhost         # Won't work externally
```

---

## Logging Configuration

| Variable          | Description                 | Default |
| ----------------- | --------------------------- | ------- |
| `LOG_TO_FILE`     | Enable file logging         | true    |
| `LOG_MAX_SIZE_MB` | Max log file size           | 10      |
| `LOG_MAX_FILES`   | Number of log files to keep | 5       |

### Log Rotation

Logs rotate automatically when they reach `LOG_MAX_SIZE_MB`:

```
logs/
  cinephage.log       ← Current log
  cinephage.log.1     ← Previous
  cinephage.log.2     ← Older
  ...
  cinephage.log.5     ← Oldest (deleted when new rotation)
```

---

## Media Configuration

| Variable                   | Description                  | Default                   |
| -------------------------- | ---------------------------- | ------------------------- |
| `FFPROBE_PATH`             | Path to ffprobe binary       | ffprobe (in PATH)         |
| `INDEXER_DEFINITIONS_PATH` | Custom indexer YAML location | data/indexers/definitions |

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

| Variable                 | Description                         | Default             |
| ------------------------ | ----------------------------------- | ------------------- |
| `PROXY_FETCH_TIMEOUT_MS` | Stream URL fetch timeout            | 30000 (30 sec)      |
| `PROXY_SEGMENT_MAX_SIZE` | Max segment size (bytes)            | 52428800 (50 MB)    |
| `PROXY_MAX_RETRIES`      | Retry attempts for failed segments  | 2                   |
| `DEFAULT_PROXY_REFERER`  | Default referer for stream requests | https://videasy.net |

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
TZ=America/New_York

# Paths
DATA_DIR=data
LOG_DIR=logs
FFPROBE_PATH=/usr/bin/ffprobe

# Logging
LOG_TO_FILE=true
LOG_MAX_SIZE_MB=10
LOG_MAX_FILES=5

# Workers
WORKER_MAX_STREAMS=10
WORKER_MAX_IMPORTS=5
WORKER_MAX_SCANS=2
WORKER_MAX_MONITORING=5
WORKER_MAX_SEARCH=3
WORKER_MAX_SUBTITLE_SEARCH=3
WORKER_MAX_PORTAL_SCANS=2
WORKER_CLEANUP_MS=1800000
WORKER_MAX_LOGS=1000

# Streaming
PROXY_FETCH_TIMEOUT_MS=30000
PROXY_SEGMENT_MAX_SIZE=52428800
PROXY_MAX_RETRIES=2
DEFAULT_PROXY_REFERER=https://videasy.net

# Circuit Breaker
PROVIDER_MAX_FAILURES=3
PROVIDER_CIRCUIT_HALF_OPEN_MS=30000
PROVIDER_CIRCUIT_RESET_MS=60000
PROVIDER_CACHE_TTL_MS=30000
PROVIDER_PARALLEL_COUNT=3

# Live TV
EPG_STARTUP_GRACE_MS=30000

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
      TZ: America/New_York
      # Workers (tuned for 4GB RAM)
      WORKER_MAX_STREAMS: 5
      WORKER_MAX_IMPORTS: 3
      WORKER_MAX_SCANS: 1
      # Streaming
      PROXY_FETCH_TIMEOUT_MS: 60000
    volumes:
      - ./config:/config
      - /path/to/media:/media
      - /path/to/downloads:/downloads
```

---

## Environment Variable Precedence

Variables are loaded in this order (later overrides earlier):

1. **Default values** — Hardcoded application defaults
2. **.env file** — Loaded automatically when running manually with npm/node, or in Docker Compose when using `env_file` directive or mounting the file
3. **Environment variables** — System environment variables or those passed directly via Docker Compose `environment:` section or `docker run -e`

**Note for Docker users:**

- If using `env_file: .env` in `docker-compose.yml`, the `.env` file is loaded into the container
- If passing variables directly via `environment:` in the compose file or `-e` flags in `docker run`, those take precedence over `.env`
- The `.env` file is NOT automatically available inside the container unless explicitly mounted or loaded via `env_file`

---

## See Also

- [Settings Reference](settings-reference.md) — UI-based settings
- [Performance Tuning](performance-tuning.md) — Optimize with env vars
- [Docker Deployment](../operations/deployment.md) — Docker-specific setup
