# Frequently Asked Questions

Quick answers to common questions about Cinephage.

---

## General

### What is Cinephage?

Cinephage is a self-hosted media management application that combines the functionality of Radarr, Sonarr, Prowlarr, and Bazarr into a single app. It handles content discovery, searching, downloading, and subtitle management from one interface backed by a single database.

### Does Cinephage host any content?

No. Cinephage is purely a media manager and aggregator. It does not host, store, or distribute any media content. It simply helps you organize your existing library and search external indexers and sources that you configure. What you do with the software is your responsibility.

### What stage of development is it in?

Cinephage is in **Alpha**. Core features work but may have bugs, and breaking changes may occur between updates.

### Is Cinephage free?

Yes. Cinephage is open source software licensed under GNU GPL v3.

---

## Installation

### What are the system requirements?

| Resource | Minimum          | Recommended      |
| -------- | ---------------- | ---------------- |
| Node.js  | 20+              | 20+              |
| RAM      | 512 MB           | 1 GB             |
| Disk     | 100 MB + library | 500 MB + library |
| CPU      | 1 core           | 2+ cores         |

### Which download clients are supported?

- qBittorrent (torrent)
- SABnzbd (usenet)
- NZBGet (usenet)

### Do I need a TMDB API key?

Yes. A free API key is required. Get one at [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api).

---

## Configuration

### How do I change the port Cinephage listens on?

**If using Docker Compose with `env_file`:** Edit `.env` and set `PORT=8080`

**If using Docker Compose with environment variables in the compose file:** Change the value directly in `docker-compose.yaml`:

```yaml
environment:
  - PORT=8080
```

**If running without Docker (manual npm/node install):** Set `PORT` in `.env`:

```bash
# In .env file
PORT=8080
```

Then restart Cinephage.

### How do I reset everything?

```bash
# Stop Cinephage
rm data/cinephage.db
# Restart Cinephage (recreates database)
```

Docker: remove `/config/data/cinephage.db` from your mounted config directory.

### Can I run multiple instances?

Not recommended. SQLite doesn't handle multiple writers well.

### Where is data stored?

| Data            | Location                                                                    |
| --------------- | --------------------------------------------------------------------------- |
| Database        | `data/cinephage.db` (Docker: `/config/data/cinephage.db`)                   |
| Logs            | `logs/` (Docker: `/config/logs/`)                                           |
| Custom indexers | `data/indexers/definitions/` (Docker: `/config/data/indexers/definitions/`) |

---

## Library

### Why aren't my files detected?

1. Verify root folder is configured
2. Check file extensions are supported (.mkv, .mp4, .avi)
3. Trigger manual scan in Settings
4. Check logs for errors

### Why aren't downloads being imported?

**Most common issue:** Download directory not mounted to Cinephage container.

**Solution:**

1. Ensure `/downloads` (or your download path) is mounted in `docker-compose.yaml`:
   ```yaml
   volumes:
     - /path/to/downloads:/downloads
   ```
2. Verify the path matches your download client's output directory
3. Check both containers can access the same files:
   ```bash
   docker exec cinephage ls /downloads
   docker exec qbittorrent ls /downloads
   ```
4. Configure path mapping if container paths differ (Settings > Download Clients)

See [Download Clients Configuration](../configuration/download-clients.md#docker-volume-requirements) for detailed setup.

### How does file matching work?

Cinephage matches files using:

1. External IDs in folder names (most reliable)
2. Parsed movie/series names
3. Year and season/episode info

For guaranteed matching, use `{tmdb-12345}` or `{tvdb-12345}` in folder names.

### Can I use existing Plex/Radarr libraries?

Yes. If your library uses external IDs in folder names (common with Radarr/Sonarr), Cinephage matches them automatically.

---

## Indexers

### Which indexers work immediately?

Public indexers (no configuration needed):

- BitSearch, EZTV, Knaben, YTS

Private trackers (require credentials):

- OldToons.World, SceneTime

### How do I add more indexers?

For usenet, use the Newznab template to connect directly to indexers like NZBGeek or DrunkenSlug.

For torrents, custom indexer definitions can be added to `data/indexers/definitions/` using Cardigann-compatible YAML format. See existing definitions for examples.

### Why is my indexer disabled?

Indexers auto-disable after repeated failures. Check the health status, fix the issue, then re-enable manually.

---

## Downloads

### Why aren't downloads starting?

1. Check download client is running
2. Verify connection settings
3. Test connection in Settings
4. Check Cinephage logs

### Why aren't imports working?

1. Verify root folder is accessible
2. Check file permissions
3. For remote clients, configure path mapping

### How do upgrades work?

When monitoring is enabled:

1. Cinephage tracks your file's quality score
2. Periodically searches for better releases
3. Downloads and replaces if significantly better

---

## Subtitles

### Which providers are supported?

6 global providers: OpenSubtitles, Addic7ed, SubDL, YIFY Subtitles, Gestdown, Subf2m

### Why aren't subtitles found?

1. Verify providers are enabled
2. Check API keys are valid
3. Not all content has available subtitles
4. Try different providers

### How do I set up automatic subtitles?

1. Configure providers in Settings
2. Create a language profile
3. Enable auto-search in Tasks

---

## Streaming

### How does streaming work?

Cinephage can stream content instead of downloading:

1. Searches streaming providers for content
2. Creates .strm files pointing to streams
3. Media servers play .strm files directly

### Which streaming providers are supported?

10 providers: Vidlink, Videasy, XPrime, Smashy, Hexa, YFlix, Mapple, OneTouchTV, AnimeKai, KissKH

---

## Monitoring

### How often does Cinephage search?

| Task              | Default Interval |
| ----------------- | ---------------- |
| Missing content   | 24 hours         |
| Quality upgrades  | Weekly           |
| New episodes      | 1 hour           |
| Cutoff unmet      | 24 hours         |
| Missing subtitles | 6 hours          |

Configure in **Settings > Tasks**.

### Why isn't a monitored item searched?

For TV shows, all three levels must be monitored:

- Series: Monitored
- Season: Monitored
- Episode: Monitored

---

## Updates

### How do I update?

**Docker:**

```bash
docker compose pull
docker compose up -d
```

**Manual:**

```bash
git pull origin main
npm ci
npm run build
sudo systemctl restart cinephage
```

### Will updates break my configuration?

During alpha, breaking changes may occur. Always backup `data/cinephage.db` before updating.

---

## Live TV / IPTV

### How does Live TV work?

Cinephage can discover and integrate with Stalker portals. The portal scanner can find working accounts, but all content comes from external services that Cinephage does not host or control.

### Why is Live TV support limited?

IPTV/Stalker portal functionality depends entirely on external services that Cinephage has no control over. Since we don't host anything and these services vary widely, support is limited. We'll do our best to help, but issues with your portal or provider are outside our scope.

### My portal isn't working. Can you help?

We can help with Cinephage-specific issues (configuration, UI bugs, etc.), but we cannot troubleshoot your portal credentials, provider issues, or service availability. Those are between you and your provider.

---

**See also:** [Troubleshooting](troubleshooting.md) | [Getting Help](getting-help.md)
