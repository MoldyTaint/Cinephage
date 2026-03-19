---
title: Environment Variables
description: Complete reference for all Cinephage environment variables
sidebar_position: 1
date: 2025-03-16
tags: [environment-variables, configuration, reference]
---

# Environment Variables

This reference documents all environment variables available for configuring Cinephage.

## Required Variables

These variables must be set for Cinephage to function correctly:

| Variable             | Description                                 | Example                 |
| -------------------- | ------------------------------------------- | ----------------------- |
| `ORIGIN`             | Trusted origin URL for CSRF protection      | `http://localhost:3000` |
| `BETTER_AUTH_URL`    | Base URL for authentication callbacks       | `http://localhost:3000` |
| `BETTER_AUTH_SECRET` | Auth secret for sessions/API-key encryption | `base64-random-string`  |

## Server Configuration

### Core Server Settings

| Variable                      | Default   | Description                                                                |
| ----------------------------- | --------- | -------------------------------------------------------------------------- |
| `HOST`                        | `0.0.0.0` | IP address to bind the server to                                           |
| `PORT`                        | `3000`    | Port number to listen on                                                   |
| `ORIGIN`                      | -         | Trusted origin URL for CSRF protection. Must match your access URL exactly |
| `BETTER_AUTH_URL`             | -         | Base URL for authentication callbacks and redirects                        |
| `BETTER_AUTH_TRUSTED_ORIGINS` | -         | Additional trusted origins for CORS (comma-separated)                      |
| `BETTER_AUTH_SECRET`          | -         | Required auth secret for session signing and API-key encryption            |
| `PUBLIC_BASE_URL`             | -         | Public-facing URL for generated external links                             |

### Examples

**Local Development:**

```yaml
environment:
  - ORIGIN=http://localhost:3000
  - BETTER_AUTH_URL=http://localhost:3000
  - BETTER_AUTH_SECRET=replace-with-random-secret
```

**Production with Reverse Proxy:**

```yaml
environment:
  - ORIGIN=https://cinephage.yourdomain.com
  - BETTER_AUTH_URL=https://cinephage.yourdomain.com
  - BETTER_AUTH_SECRET=replace-with-random-secret
  - PUBLIC_BASE_URL=https://cinephage.yourdomain.com
```

**Multiple Origins (Advanced):**

```yaml
environment:
  - ORIGIN=https://cinephage.yourdomain.com
  - BETTER_AUTH_URL=https://cinephage.yourdomain.com
  - BETTER_AUTH_SECRET=replace-with-random-secret
  - BETTER_AUTH_TRUSTED_ORIGINS=https://cinephage.yourdomain.com,https://app.yourdomain.com
```

Generate `BETTER_AUTH_SECRET` with one of:

- `openssl rand -base64 32`
- `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- `python3 -c "import secrets,base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"`

## System Configuration

### User/Group IDs

| Variable | Default | Description                                    |
| -------- | ------- | ---------------------------------------------- |
| `PUID`   | `1000`  | User ID for file permissions inside container  |
| `PGID`   | `1000`  | Group ID for file permissions inside container |

These map the container user to your host user for proper file ownership:

```bash
# Get your IDs
id -u  # User ID
id -g  # Group ID
```

```yaml
environment:
  - PUID=1000
  - PGID=1000
```

### Timezone

| Variable | Default | Description                              |
| -------- | ------- | ---------------------------------------- |
| `TZ`     | `UTC`   | Timezone for scheduled tasks and logging |

Valid values are TZ database names:

- `America/New_York`
- `Europe/London`
- `Asia/Tokyo`
- `Australia/Sydney`
- See [full list](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)

### Advanced Permissions

| Variable                          | Default | Description                                                 |
| --------------------------------- | ------- | ----------------------------------------------------------- |
| `CINEPHAGE_FORCE_RECURSIVE_CHOWN` | `0`     | Force full recursive ownership fix on startup (1 to enable) |

Set to `1` if you experience permission issues after changing PUID/PGID.

## Logging Configuration

### Log Level

| Variable    | Default | Description                 |
| ----------- | ------- | --------------------------- |
| `LOG_LEVEL` | `info`  | Minimum log level to output |

Valid levels (in order of verbosity):

- `debug` - Detailed debugging information
- `info` - General information (default)
- `warn` - Warnings and errors
- `error` - Errors only

### Log Options

| Variable            | Default | Description                                          |
| ------------------- | ------- | ---------------------------------------------------- |
| `LOG_INCLUDE_STACK` | `false` | Include stack traces in error logs                   |
| `LOG_SENSITIVE`     | `false` | Log sensitive data (debug only, never in production) |

**Enable debug logging:**

```yaml
environment:
  - LOG_LEVEL=debug
  - LOG_INCLUDE_STACK=true
```

**Warning:** Never enable `LOG_SENSITIVE` in production as it logs passwords, API keys, and other sensitive data.

## Worker Configuration

Workers handle background tasks. These limits control concurrency:

| Variable                     | Default | Description                                 |
| ---------------------------- | ------- | ------------------------------------------- |
| `WORKER_MAX_STREAMS`         | `10`    | Maximum concurrent streaming operations     |
| `WORKER_MAX_IMPORTS`         | `5`     | Maximum concurrent file imports             |
| `WORKER_MAX_SCANS`           | `2`     | Maximum concurrent library scans            |
| `WORKER_MAX_MONITORING`      | `5`     | Maximum concurrent monitoring tasks         |
| `WORKER_MAX_SEARCH`          | `3`     | Maximum concurrent indexer searches         |
| `WORKER_MAX_SUBTITLE_SEARCH` | `3`     | Maximum concurrent subtitle searches        |
| `WORKER_MAX_PORTAL_SCANS`    | `2`     | Maximum concurrent portal scans (Live TV)   |
| `WORKER_MAX_CHANNEL_SYNCS`   | `3`     | Maximum concurrent channel synchronizations |

### Tuning Workers

**Low-resource systems:**

```yaml
environment:
  - WORKER_MAX_STREAMS=5
  - WORKER_MAX_IMPORTS=2
  - WORKER_MAX_SCANS=1
  - WORKER_MAX_SEARCH=2
```

**High-performance systems:**

```yaml
environment:
  - WORKER_MAX_STREAMS=20
  - WORKER_MAX_IMPORTS=10
  - WORKER_MAX_SCANS=4
  - WORKER_MAX_SEARCH=5
```

## Streaming Configuration

### Proxy Settings

| Variable                 | Default    | Description                                         |
| ------------------------ | ---------- | --------------------------------------------------- |
| `PROXY_FETCH_TIMEOUT_MS` | `30000`    | Timeout for fetching stream segments (milliseconds) |
| `PROXY_SEGMENT_MAX_SIZE` | `52428800` | Maximum segment size in bytes (50MB default)        |
| `PROXY_MAX_RETRIES`      | `2`        | Maximum retry attempts for failed segments          |
| `DEFAULT_PROXY_REFERER`  | -          | Default referer header for stream requests          |

### Provider Circuit Breaker

Circuit breakers prevent repeated failures with streaming providers:

| Variable                        | Default | Description                                        |
| ------------------------------- | ------- | -------------------------------------------------- |
| `PROVIDER_MAX_FAILURES`         | `3`     | Failures before opening circuit                    |
| `PROVIDER_CIRCUIT_HALF_OPEN_MS` | `30000` | Time before trying provider again (milliseconds)   |
| `PROVIDER_CIRCUIT_RESET_MS`     | `60000` | Time before fully resetting circuit (milliseconds) |

## Live TV Configuration

### EPG Settings

| Variable               | Default | Description                                        |
| ---------------------- | ------- | -------------------------------------------------- |
| `EPG_STARTUP_GRACE_MS` | `30000` | Grace period for EPG initialization (milliseconds) |

### API Rate Limiting

| Variable                                 | Default   | Description                                |
| ---------------------------------------- | --------- | ------------------------------------------ |
| `STREAMING_API_KEY_RATE_LIMIT_WINDOW_MS` | `3600000` | Rate limit window (1 hour in milliseconds) |
| `STREAMING_API_KEY_RATE_LIMIT_MAX`       | `10000`   | Maximum requests per window per API key    |

## External Tools

### ffprobe

| Variable       | Default | Description                           |
| -------------- | ------- | ------------------------------------- |
| `FFPROBE_PATH` | -       | Path to ffprobe binary if not in PATH |

Set if ffprobe is not in your system PATH:

```yaml
environment:
  - FFPROBE_PATH=/usr/local/bin/ffprobe
```

## Complete Docker Compose Example

```yaml
services:
  cinephage:
    image: ghcr.io/moldytaint/cinephage:latest
    container_name: cinephage
    restart: unless-stopped
    ports:
      - '3000:3000'
    environment:
      # Server
      - HOST=0.0.0.0
      - PORT=3000
      - ORIGIN=https://cinephage.yourdomain.com
      - BETTER_AUTH_URL=https://cinephage.yourdomain.com

      # System
      - PUID=1000
      - PGID=1000
      - TZ=America/New_York

      # Logging
      - LOG_LEVEL=info

      # Workers (adjust based on your hardware)
      - WORKER_MAX_STREAMS=10
      - WORKER_MAX_IMPORTS=5
      - WORKER_MAX_SCANS=2
      - WORKER_MAX_SEARCH=3
      - WORKER_MAX_SUBTITLE_SEARCH=3

      # Streaming
      - PROXY_FETCH_TIMEOUT_MS=30000
      - PROXY_MAX_RETRIES=2

    volumes:
      - ./config:/config
      - /mnt/media:/media
      - /mnt/downloads:/downloads
```

## Variable Reference Table

### Quick Reference

| Category            | Variables                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| **Server**          | `HOST`, `PORT`, `ORIGIN`, `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`, `PUBLIC_BASE_URL`    |
| **System**          | `PUID`, `PGID`, `TZ`, `CINEPHAGE_FORCE_RECURSIVE_CHOWN`                                          |
| **Logging**         | `LOG_LEVEL`, `LOG_INCLUDE_STACK`, `LOG_SENSITIVE`                                                |
| **Workers**         | `WORKER_MAX_*` (8 variables)                                                                     |
| **Streaming**       | `PROXY_FETCH_TIMEOUT_MS`, `PROXY_SEGMENT_MAX_SIZE`, `PROXY_MAX_RETRIES`, `DEFAULT_PROXY_REFERER` |
| **Circuit Breaker** | `PROVIDER_MAX_FAILURES`, `PROVIDER_CIRCUIT_HALF_OPEN_MS`, `PROVIDER_CIRCUIT_RESET_MS`            |
| **Live TV**         | `EPG_STARTUP_GRACE_MS`, `STREAMING_API_KEY_RATE_LIMIT_*`                                         |
| **Tools**           | `FFPROBE_PATH`                                                                                   |

### Total Variables

- **Required:** 2
- **Recommended:** 4 (PUID, PGID, TZ, LOG_LEVEL)
- **Optional:** 20+
- **Total:** 26+ environment variables

## Troubleshooting

### Changes Not Taking Effect

If environment variable changes do not work:

1. Check syntax (no spaces around `=`)
2. Restart the container: `docker compose restart`
3. Verify variables are set: `docker exec cinephage env | grep VARIABLE`

### Common Mistakes

**Wrong:**

```yaml
environment:
  - ORIGIN = http://localhost:3000 # Spaces around =
  - origin=http://localhost:3000 # lowercase
```

**Correct:**

```yaml
environment:
  - ORIGIN=http://localhost:3000
```

### Debug Configuration

View current environment:

```bash
docker exec cinephage env | sort
```

Check specific variable:

```bash
docker exec cinephage env | grep LOG_LEVEL
```

## See Also

- [Settings Explained](settings-explained) for UI-configurable settings
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
- [Performance Tuning](../../guides/deploy/performance-tuning)
