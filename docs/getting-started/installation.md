# Installation

Get Cinephage up and running with Docker (recommended) or manual installation.

---

## Requirements

### Software

| Component       | Required    | Notes                                                             |
| --------------- | ----------- | ----------------------------------------------------------------- |
| Download Client | Yes         | qBittorrent 4.5+, SABnzbd 4.0+, or NZBGet                         |
| TMDB API Key    | Yes         | Free at [themoviedb.org](https://www.themoviedb.org/settings/api) |
| Node.js         | Manual only | Version 20+ (comes with npm 10+)                                  |
| ffprobe         | Optional    | For media info extraction (resolution, codecs)                    |

### System

| Resource | Docker (Min) | Docker (Recommended) | Manual Install (Min) | Manual Install (Recommended) |
| -------- | ------------ | -------------------- | -------------------- | ---------------------------- |
| RAM      | 512 MB       | 1 GB                 | 1 GB                 | 2 GB                         |
| Disk     | 500 MB       | 2 GB                 | 2 GB                 | 4 GB                         |
| CPU      | 1 core       | 2+ cores             | 1 core               | 2+ cores                     |

**Disk space breakdown:**

- **Docker:** Image (~220MB) + database + logs + cache + Camoufox (~80MB)
- **Manual:** node_modules (~500-800MB) + build artifacts + database + logs + cache + Camoufox

> **Note:** Disk space above is for Cinephage itself. Your media library and downloads are stored separately and mounted/accessed by the application.

---

## Docker Installation (Recommended)

Docker provides the simplest setup and automatic updates.

### Quick Start

Create a `docker-compose.yaml` file:

```yaml
services:
  cinephage:
    image: ghcr.io/moldytaint/cinephage:latest
    container_name: cinephage
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
    ports:
      - '3000:3000'
    environment:
      - PUID=1000 # Your user ID (run: id -u)
      - PGID=1000 # Your group ID (run: id -g)
      - TZ=UTC # Your timezone
      - ORIGIN=http://localhost:3000 # Your access URL (required if using IP/FQDN)
    volumes:
      - ./config:/config
      - /path/to/media:/media # REQUIRED: Your media library
      - /path/to/downloads:/downloads # REQUIRED: Download client output folder
```

Start Cinephage:

```bash
docker compose up -d
```

Open http://localhost:3000 and follow the setup wizard.

### Configuration Reference

All configuration is done via environment variables in `docker-compose.yaml`:

| Variable | Required | Default               | Description                                 |
| -------- | -------- | --------------------- | ------------------------------------------- |
| `PORT`   | No       | 3000                  | Port to expose/listen on                    |
| `PUID`   | No       | 1000                  | User ID for file permissions                |
| `PGID`   | No       | 1000                  | Group ID for file permissions               |
| `TZ`     | No       | UTC                   | Timezone (e.g., America/New_York)           |
| `ORIGIN` | No       | http://localhost:3000 | Your access URL (required if using IP/FQDN) |

**Volume Mounts:**

| Path         | Required | Description                                  |
| ------------ | -------- | -------------------------------------------- |
| `/config`    | Yes      | App data, database, and logs                 |
| `/media`     | Yes      | Your media library                           |
| `/downloads` | Yes      | Download client output (for importing files) |

> **Important:** Both Cinephage and your download client must mount the same download directory. See [Download Clients Configuration](../configuration/download-clients.md#docker-volume-requirements).

Data, configuration, and logs are stored under `/config` in the container. Mount a host directory to `/config` to persist them. Avoid mounting `/app`, which contains the application files.

> **Upgrade note:** If you previously mounted `/app/data` and `/app/logs`, run one start with both the old mounts **and** `/config` mounted. The entrypoint will copy existing data/logs into `/config`, then you can remove the old mounts. If migration fails due to permissions, rerun once as root (`user: 0:0` or `--user 0:0`) and set `PUID`/`PGID`.

#### Entrypoint Ownership (Advanced)

These variables are read directly by the container entrypoint. They only take effect when the container starts as root (for example, no `user:` flag in Compose or `--user` in `docker run`).

| Variable | Required | Default | Description                 |
| -------- | -------- | ------- | --------------------------- |
| `PUID`   | No       | 1000    | Runtime user ID to drop to  |
| `PGID`   | No       | 1000    | Runtime group ID to drop to |

At startup, the entrypoint ensures ownership of `/config` and `/home/node/.cache` matches the runtime UID/GID, which covers config/data/logs and cached browser downloads.

### Using Docker Run

```bash
docker run -d \
  --name cinephage \
  --restart unless-stopped \
  -p 3000:3000 \
  -v ./config:/config \
  -v /path/to/your/media:/media \
  -v /path/to/your/downloads:/downloads \
  -e PUID=1000 \
  -e PGID=1000 \
  -e ORIGIN=http://localhost:3000 \
  -e TZ=UTC \
  ghcr.io/moldytaint/cinephage:latest
```

> **Note:** When using `docker run`, pass the actual application variables (`ORIGIN`, `TZ`, `PUID`, `PGID`) directly.
>
> The container starts as root, then the entrypoint automatically drops privileges to `PUID:PGID` (default: 1000:1000) and fixes ownership of `/config` and cache directories.

### Building from Source

To build the Docker image yourself instead of using the pre-built image:

```bash
git clone https://github.com/MoldyTaint/cinephage.git
cd cinephage
cp .env.example .env
# Then edit docker-compose.yaml: uncomment "build: ." and comment out "image:"
docker compose up -d --build
```

---

## Manual Installation

For running without Docker or for development.

### 1. Clone the Repository

```bash
git clone https://github.com/MoldyTaint/cinephage.git
cd cinephage
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build the Application

```bash
npm run build
```

### 4. Start the Server

```bash
npm start
```

Cinephage is now running at **http://localhost:3000**.

The database initializes automatically on first run at `data/cinephage.db`.

---

## Installing ffprobe (Optional)

ffprobe enables media info extraction for resolution, codec, and audio track details. Without it, Cinephage can still function but won't detect quality information from existing files.

**Ubuntu/Debian:**

```bash
sudo apt install ffmpeg
```

**macOS:**

```bash
brew install ffmpeg
```

**Windows:**
Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH.

If ffprobe is not in your system PATH, set the `FFPROBE_PATH` environment variable to its location.

---

## Verify Installation

Open http://localhost:3000 in your browser. You should see the Cinephage interface prompting you for initial setup.

If the page doesn't load:

- Check that port 3000 is not in use by another application
- Review the logs (`logs/` directory or `docker logs cinephage`)
- See [Troubleshooting](../support/troubleshooting.md) for common issues

---

## Next Steps

Continue to **[Setup Wizard](setup-wizard.md)** to configure TMDB, download clients, and root folders.

---

**See also:** [Setup Wizard](setup-wizard.md) | [Deployment](../operations/deployment.md) | [Settings Reference](../configuration/settings-reference.md)
