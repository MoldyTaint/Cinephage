# Settings Reference

Complete reference for Cinephage configuration options.

---

## Environment Variables

Copy `.env.example` to `.env` and configure as needed. All variables have sensible defaults.

### Server Configuration

| Variable | Default   | Description                                                 |
| -------- | --------- | ----------------------------------------------------------- |
| `HOST`   | `0.0.0.0` | Host address to bind                                        |
| `PORT`   | `3000`    | Port to listen on                                           |
| `ORIGIN` | -         | Trusted origin for CSRF (e.g., `http://192.168.1.100:3000`) |

**Notes:**

- Set `HOST` to `127.0.0.1` when behind a reverse proxy
- `ORIGIN` is required for external access

### Logging

| Variable          | Default  | Description                       |
| ----------------- | -------- | --------------------------------- |
| `LOG_DIR`         | `./logs` | Log file directory                |
| `LOG_MAX_SIZE_MB` | `10`     | Max log file size before rotation |
| `LOG_MAX_FILES`   | `5`      | Number of rotated logs to keep    |
| `LOG_TO_FILE`     | `true`   | Enable/disable file logging       |

### Media Info

| Variable       | Default     | Description            |
| -------------- | ----------- | ---------------------- |
| `FFPROBE_PATH` | System PATH | Path to ffprobe binary |

If ffprobe is not in your PATH, specify the full path.

### Worker Configuration

Controls concurrency for background tasks.

| Variable                | Default   | Description                      |
| ----------------------- | --------- | -------------------------------- |
| `WORKER_MAX_STREAMS`    | `10`      | Max concurrent stream resolution |
| `WORKER_MAX_IMPORTS`    | `5`       | Max concurrent file imports      |
| `WORKER_MAX_SCANS`      | `2`       | Max concurrent library scans     |
| `WORKER_MAX_MONITORING` | `5`       | Max concurrent monitoring tasks  |
| `WORKER_CLEANUP_MS`     | `1800000` | Worker cleanup interval (30 min) |
| `WORKER_MAX_LOGS`       | `1000`    | Max log entries per worker       |

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

## Docker Configuration

When using Docker, configure via `.env` or environment variables:

### Docker-Specific Variables

> [!NOTE]
> The variables listed below are Docker/Compose helper variables, not application configuration keys used directly by Cinephage. They are used by Docker and docker-compose to control things like port mappings, volume paths, and container user IDs, and may optionally be defined in a .env file for convenience. The variable names themselves are not required or hard-coded — they are provided as a documented convention to make Docker setups clearer and easier to manage.

<br>

| Variable               | Default | Description                 |
| ---------------------- | ------- | --------------------------- |
| `CINEPHAGE_PORT`       | `3000`  | External port mapping       |
| `CINEPHAGE_MEDIA_PATH` | -       | Path to media on host       |
| `CINEPHAGE_UID`        | `1000`  | User ID for file ownership  |
| `CINEPHAGE_GID`        | `1000`  | Group ID for file ownership |
| `CINEPHAGE_ORIGIN`     | -       | External URL for CSRF       |
| `CINEPHAGE_TZ`         | `UTC`   | Timezone                    |

### Example docker-compose.yaml

```yaml
services:
  cinephage:
    image: ghcr.io/moldytaint/cinephage:latest
    container_name: cinephage
    user: '${CINEPHAGE_UID:-1000}:${CINEPHAGE_GID:-1000}'
    ports:
      - '${CINEPHAGE_PORT:-3000}:3000'
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
      - ${CINEPHAGE_MEDIA_PATH}:/media
    environment:
      - ORIGIN=${CINEPHAGE_ORIGIN:-http://localhost:3000}
      - TZ=${CINEPHAGE_TZ:-UTC}
    restart: unless-stopped
```

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
