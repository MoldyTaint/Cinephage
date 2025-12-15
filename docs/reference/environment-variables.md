[< Back to Index](../INDEX.md) | [API Reference](api.md)

# Environment Variables

Complete reference for Cinephage environment configuration. Copy `.env.example` to `.env` and configure as needed. All variables have sensible defaults.

---

## Server Configuration

| Variable | Default   | Description                                                 |
|----------|-----------|-------------------------------------------------------------|
| `HOST`   | `0.0.0.0` | Host address to bind (use `127.0.0.1` behind reverse proxy) |
| `PORT`   | `3000`    | Port to listen on                                           |
| `ORIGIN` | -         | Trusted origin for CSRF (e.g., `http://192.168.1.100:3000`) |

---

## Logging Configuration

| Variable          | Default  | Description                           |
|-------------------|----------|---------------------------------------|
| `LOG_DIR`         | `./logs` | Log file directory                    |
| `LOG_MAX_SIZE_MB` | `10`     | Maximum log file size before rotation |
| `LOG_MAX_FILES`   | `5`      | Number of rotated logs to keep        |
| `LOG_TO_FILE`     | `true`   | Enable/disable file logging           |

---

## Media Info

| Variable       | Default     | Description            |
|----------------|-------------|------------------------|
| `FFPROBE_PATH` | System PATH | Path to ffprobe binary |

---

## Worker Configuration

Controls concurrency for background tasks.

| Variable                | Default   | Description                       |
|-------------------------|-----------|-----------------------------------|
| `WORKER_MAX_STREAMS`    | `10`      | Max concurrent stream workers     |
| `WORKER_MAX_IMPORTS`    | `5`       | Max concurrent import workers     |
| `WORKER_MAX_SCANS`      | `2`       | Max concurrent scan workers       |
| `WORKER_MAX_MONITORING` | `5`       | Max concurrent monitoring workers |
| `WORKER_CLEANUP_MS`     | `1800000` | Worker cleanup interval (30 min)  |
| `WORKER_MAX_LOGS`       | `1000`    | Max log entries per worker        |

---

## Graceful Shutdown

| Variable           | Default | Description                              |
|--------------------|---------|------------------------------------------|
| `SHUTDOWN_TIMEOUT` | `30`    | Seconds to wait for connections to close |

---

## Database

The database is configured automatically:

- **Location**: `data/cinephage.db`
- **Type**: SQLite with better-sqlite3
- **Migrations**: Run automatically on startup

No environment variables are required for database configuration.

---

**See also:** [Installation](../getting-started/installation.md) | [Production Deployment](../deployment/production.md)
