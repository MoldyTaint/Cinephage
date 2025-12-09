# Configuration

This guide covers environment variables and first-run setup for Cinephage.

## Environment Variables

Copy `.env.example` to `.env` and configure as needed. All variables have sensible defaults.

### Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Host address to bind (use `127.0.0.1` behind reverse proxy) |
| `PORT` | `3000` | Port to listen on |
| `ORIGIN` | - | Trusted origin for CSRF (e.g., `http://192.168.1.100:3000`) |

### Logging Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_DIR` | `./logs` | Log file directory |
| `LOG_MAX_SIZE_MB` | `10` | Maximum log file size before rotation |
| `LOG_MAX_FILES` | `5` | Number of rotated logs to keep |
| `LOG_TO_FILE` | `true` | Enable/disable file logging |

### Media Info

| Variable | Default | Description |
|----------|---------|-------------|
| `FFPROBE_PATH` | System PATH | Path to ffprobe binary |

### Worker Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKER_MAX_STREAMS` | `10` | Max concurrent stream workers |
| `WORKER_MAX_IMPORTS` | `5` | Max concurrent import workers |
| `WORKER_MAX_SCANS` | `2` | Max concurrent scan workers |
| `WORKER_MAX_MONITORING` | `5` | Max concurrent monitoring workers |
| `WORKER_CLEANUP_MS` | `1800000` | Worker cleanup interval (30 min) |
| `WORKER_MAX_LOGS` | `1000` | Max log entries per worker |

### Graceful Shutdown

| Variable | Default | Description |
|----------|---------|-------------|
| `SHUTDOWN_TIMEOUT` | `30` | Seconds to wait for connections to close |

---

## First Run Setup

After starting Cinephage for the first time, complete these configuration steps in the web UI.

### 1. TMDB API Key

Required for movie and TV metadata.

1. Get a free API key at https://www.themoviedb.org/settings/api
2. Navigate to Settings > General
3. Enter your TMDB API key
4. The key is validated automatically

### 2. Download Client

Configure qBittorrent for downloading.

1. Navigate to Settings > Integrations > Download Clients
2. Click "Add Download Client"
3. Enter connection details:
   - **Host**: `localhost` or IP address of qBittorrent
   - **Port**: `8080` (default qBittorrent WebUI port)
   - **Username**: WebUI username
   - **Password**: WebUI password
4. Test the connection before saving

**qBittorrent Requirements:**

- WebUI must be enabled (Options > Web UI > Enable)
- "Bypass authentication for localhost" can be used for local installs
- If Cinephage runs remotely, whitelist its IP in qBittorrent

### 3. Root Folders

Define where media files are stored.

1. Navigate to Settings > General
2. Add root folders:
   - One folder for movies (e.g., `/media/movies`)
   - One folder for TV series (e.g., `/media/tv`)
3. Cinephage organizes downloads into these locations automatically

**Path Mapping (Remote Clients):**

If qBittorrent and Cinephage see different paths for the same storage:

| qBittorrent Path | Cinephage Path |
|------------------|----------------|
| `/downloads/movies` | `/mnt/media/movies` |

Configure path mappings in Settings > Integrations > Download Clients.

### 4. Indexers

Enable torrent search sources.

1. Navigate to Settings > Integrations > Indexers
2. Enable desired indexers (public indexers work out of the box)
3. For private trackers, enter API keys or credentials
4. Test each indexer to verify connectivity

See [Indexers](INDEXERS.md) for detailed indexer setup.

### 5. Quality Profile (Optional)

Review and customize quality preferences.

1. Navigate to Settings > Profiles
2. Review built-in profiles (Best, Efficient, Micro, Streaming)
3. Create custom profiles if the defaults don't fit your needs

See [Quality Profiles](QUALITY-PROFILES.md) for scoring details.

---

## System Requirements

### Minimum

| Resource | Minimum |
|----------|---------|
| RAM | 512 MB |
| Disk Space | 100 MB + library |
| CPU | 1 core |

### Recommended

| Resource | Recommended |
|----------|-------------|
| RAM | 1 GB |
| Disk Space | 500 MB + library |
| CPU | 2+ cores |

### Optional Dependencies

**ffprobe** - For media info extraction (resolution, codec, audio details)

- Ubuntu/Debian: `sudo apt install ffmpeg`
- macOS: `brew install ffmpeg`
- Windows: Download from https://ffmpeg.org/download.html

---

## Production Deployment

For production deployment including:

- Building for production
- Systemd service configuration
- Reverse proxy setup
- SSL/TLS configuration
- Database backup procedures

See the [Deployment Guide](DEPLOYMENT.md).
