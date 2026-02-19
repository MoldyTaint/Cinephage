# Settings Reference

Complete reference for Cinephage configuration options.

---

## Environment Variables

If deploying without Docker, or if you want to pass the environment variables to the container via an env_file, copy `.env.example` to `.env` and configure it as needed. All variables have sensible defaults.

### Server Configuration

| Variable | Default   | Description                                                 |
| -------- | --------- | ----------------------------------------------------------- |
| `HOST`   | `0.0.0.0` | Host address to bind                                        |
| `PORT`   | `3000`    | Port to listen on                                           |
| `ORIGIN` | -         | Trusted origin for CSRF (e.g., `http://192.168.1.100:3000`) |
| `PUID`   | `1000`    | User ID for file permissions (Docker Only)                  |
| `PGID`   | `1000`    | Group ID for file permissions (Docker Only)                 |

**Notes:**

- Set `HOST` to `127.0.0.1` when behind a reverse proxy on the same machine
- `ORIGIN` is required for external access

### Logging

| Variable            | Default                    | Description                                        |
| ------------------- | -------------------------- | -------------------------------------------------- |
| `LOG_DIR`           | `./logs`                   | Log file directory                                 |
| `LOG_MAX_SIZE_MB`   | `10`                       | Max log file size before rotation                  |
| `LOG_MAX_FILES`     | `5`                        | Number of rotated logs to keep                     |
| `LOG_TO_FILE`       | `true`                     | Enable/disable file logging                        |
| `LOG_INCLUDE_STACK` | Dev: `true`, Prod: `false` | Force include/suppress error stack traces          |
| `LOG_SENSITIVE`     | `false`                    | Set `true` to bypass secret redaction (debug only) |

### Media Info

| Variable       | Default     | Description            |
| -------------- | ----------- | ---------------------- |
| `FFPROBE_PATH` | System PATH | Path to ffprobe binary |

If ffprobe is not in your PATH, specify the full path.

### Worker Configuration

Controls concurrency for background tasks.

| Variable                     | Default   | Description                      |
| ---------------------------- | --------- | -------------------------------- |
| `WORKER_MAX_STREAMS`         | `10`      | Max concurrent stream resolution |
| `WORKER_MAX_IMPORTS`         | `5`       | Max concurrent file imports      |
| `WORKER_MAX_SCANS`           | `2`       | Max concurrent library scans     |
| `WORKER_MAX_MONITORING`      | `5`       | Max concurrent monitoring tasks  |
| `WORKER_MAX_SEARCH`          | `3`       | Max concurrent search tasks      |
| `WORKER_MAX_SUBTITLE_SEARCH` | `3`       | Max concurrent subtitle searches |
| `WORKER_MAX_PORTAL_SCANS`    | `2`       | Max concurrent portal scans      |
| `WORKER_MAX_CHANNEL_SYNCS`   | `3`       | Max concurrent channel syncs     |
| `WORKER_CLEANUP_MS`          | `1800000` | Worker cleanup interval (30 min) |
| `WORKER_MAX_LOGS`            | `1000`    | Max log entries per worker       |

**Tuning tips:**

- Increase `WORKER_MAX_IMPORTS` for faster bulk imports
- Decrease workers if system resources are limited
- Default values work well for most setups

### Graceful Shutdown

| Variable           | Default | Description                              |
| ------------------ | ------- | ---------------------------------------- |
| `SHUTDOWN_TIMEOUT` | `30`    | Seconds to wait for connections to close |

---

## Database

The database is configured automatically:

| Property       | Value                   |
| -------------- | ----------------------- |
| **Location**   | `data/cinephage.db`     |
| **Type**       | SQLite (better-sqlite3) |
| **Migrations** | Automatic on startup    |

No environment variables are required for database configuration.

### Database Management

```bash
# Show database info
npm run db:info

# Reset database (delete and recreate)
npm run db:reset

# Optimize database
sqlite3 data/cinephage.db "VACUUM;"
```

---

---

## In-App Settings

Most settings are configured through the web UI at **Settings**.

### General Settings

| Setting                 | Description              |
| ----------------------- | ------------------------ |
| TMDB API Key            | Required for metadata    |
| Root Folders            | Media storage locations  |
| Default Quality Profile | Applied to new additions |

### Integration Settings

| Category           | Settings                                 |
| ------------------ | ---------------------------------------- |
| Download Clients   | qBittorrent, SABnzbd, NZBGet connections |
| Indexers           | Search sources and credentials           |
| Subtitle Providers | Subtitle sources and API keys            |
| Notifications      | Media server integrations                |

### Task Settings

Configure monitoring task intervals and behavior.

### Naming Settings

Configure file and folder naming templates.

---

## File Locations

| File/Directory               | Purpose                         |
| ---------------------------- | ------------------------------- |
| `data/cinephage.db`          | SQLite database                 |
| `data/indexers/definitions/` | Custom YAML indexer definitions |
| `logs/`                      | Application logs                |
| `.env`                       | Environment configuration       |

---

## Ports

| Service           | Default Port |
| ----------------- | ------------ |
| Cinephage         | 3000         |
| qBittorrent WebUI | 8080         |
| SABnzbd           | 8080         |
| NZBGet            | 6789         |
| Jellyfin          | 8096         |
| Emby              | 8096         |

---

**See also:** [Installation](../getting-started/installation.md) | [Deployment](../operations/deployment.md) | [Troubleshooting](../support/troubleshooting.md)
