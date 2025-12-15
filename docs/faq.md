[< Back to Index](INDEX.md) | [Troubleshooting](troubleshooting.md)

# Frequently Asked Questions

Quick answers to common questions about Cinephage.

---

## General

### What is Cinephage?

Cinephage is a self-hosted media management application that combines the functionality of Radarr, Sonarr, Prowlarr, and Bazarr into a single application. It handles content discovery, searching, downloading, and subtitle management.

### What stage of development is Cinephage in?

Cinephage is currently in **Alpha**. This means:
- Core features work but may have bugs
- APIs and configuration may change between updates
- Feedback and issue reports are welcome

### Is Cinephage free?

Yes. Cinephage is open source software licensed under GNU GPL v3.

---

## Installation

### What are the system requirements?

**Minimum:**
- Node.js 20+
- 512 MB RAM
- 100 MB disk space + library

**Recommended:**
- Node.js 20+
- 1 GB RAM
- 500 MB disk space + library
- 2+ CPU cores

### Which download clients are supported?

Currently supported:
- qBittorrent (torrent)
- SABnzbd (usenet)
- NZBGet (usenet)

Planned: Transmission, Deluge

### Do I need a TMDB API key?

Yes. A free TMDB API key is required for metadata. Get one at [themoviedb.org](https://www.themoviedb.org/settings/api).

---

## Configuration

### How do I change the port?

Edit `.env`:
```
PORT=8080
```
Then restart Cinephage.

### How do I reset everything?

```bash
# Stop the application
# Backup your data first if needed
rm -rf data/cinephage.db
npm run db:push
# Restart the application
```

### Can I run multiple instances?

Not recommended. SQLite does not handle multiple writers well. Use a single instance.

### Where is data stored?

- Database: `data/cinephage.db`
- Logs: `logs/` (or configured directory)
- Indexer definitions: `data/indexers/definitions/`

### How do I backup my configuration?

Important files to backup:
- `data/cinephage.db` - All settings, library, queue
- `.env` - Environment configuration
- `data/indexers/definitions/` - Custom indexer definitions

---

## Library

### Why aren't my files being detected?

1. Verify the root folder is configured correctly
2. Check file extensions are supported (.mkv, .mp4, .avi)
3. Trigger a manual scan: **Settings > Library > Scan**
4. Check logs for scanning errors

### How does file matching work?

Cinephage matches files using:
1. External IDs in folder/file names (most reliable)
2. Parsed movie/series names
3. Year information
4. Season/episode detection

For guaranteed matching, use external IDs like `{tmdb-12345}` in folder names.

### Can I use existing Plex/Radarr/Sonarr libraries?

Yes. If your library uses external IDs in folder names (common with Radarr/Sonarr), Cinephage will match them automatically.

---

## Indexers

### Which indexers work out of the box?

Public indexers that work immediately:
- BitSearch
- EZTV
- Knaben
- YTS

Private trackers requiring configuration:
- OldToons.World (API key)
- SceneTime (cookie auth)

### How do I add indexers not built-in?

Use Torznab/Newznab integration:
1. Set up Prowlarr or Jackett
2. Add indexers to Prowlarr/Jackett
3. In Cinephage, add a Torznab indexer pointing to Prowlarr/Jackett

### Why is an indexer showing as disabled?

Indexers are auto-disabled after repeated failures. Check:
1. Indexer health in **Settings > Integrations > Indexers**
2. Whether the site is accessible
3. API key validity (for private trackers)

Re-enable manually after resolving the issue.

---

## Downloads

### Why aren't downloads starting?

1. Check qBittorrent is running and WebUI is enabled
2. Verify connection settings in Cinephage
3. Check Cinephage logs for errors
4. Test the connection in **Settings > Integrations > Download Clients**

### Why aren't completed downloads being imported?

1. Verify root folder is accessible
2. Check file permissions
3. Ensure download path is visible to Cinephage
4. For remote clients, configure path mapping

### How does quality upgrade work?

When monitoring is enabled:
1. Cinephage tracks your file's quality score
2. Periodically searches for better releases
3. If a better release is found (above minimum improvement threshold)
4. Downloads new file and replaces old one automatically

---

## Subtitles

### Which subtitle providers are supported?

- OpenSubtitles (requires API key)
- Addic7ed
- SubDL
- YIFY Subtitles
- Gestdown
- Subf2m

### Why aren't subtitles being found?

1. Verify providers are enabled
2. Check API keys are valid
3. Not all content has subtitles available
4. Try different providers

### How do I set up automatic subtitles?

1. Configure providers in **Settings > Integrations > Subtitle Providers**
2. Create a language profile in **Settings > Language Profiles**
3. Enable auto-search in **Settings > Tasks**

---

## Monitoring

### How often does Cinephage search for content?

Default intervals:
- Missing content: Every 24 hours
- Quality upgrades: Weekly
- New episodes: Every hour
- Cutoff unmet: Every 24 hours

Configure in **Settings > Tasks**.

### Why isn't a monitored item being searched?

Check cascading monitoring for TV:
- Series must be monitored
- Season must be monitored
- Episode must be monitored

All three levels must be enabled.

---

## Updates

### How do I update Cinephage?

```bash
# Stop the service
sudo systemctl stop cinephage

# Backup database
cp data/cinephage.db data/cinephage.db.backup

# Pull updates
git pull origin main

# Install dependencies
npm ci --production=false

# Rebuild
npm run build

# Run migrations
npm run db:push

# Restart
sudo systemctl start cinephage
```

### Will updates break my configuration?

During alpha, breaking changes may occur. Always backup `data/cinephage.db` before updating.

---

## Getting Help

### Where can I get support?

- [Discord](https://discord.gg/scGCBTSWEt) - Community chat
- [GitHub Issues](https://github.com/MoldyTaint/Cinephage/issues) - Bug reports
- [Troubleshooting Guide](troubleshooting.md) - Common issues

### How do I report a bug?

1. Check existing [GitHub Issues](https://github.com/MoldyTaint/Cinephage/issues)
2. If not found, open a new issue with:
   - Clear description
   - Steps to reproduce
   - Expected vs actual behavior
   - Logs (redact sensitive info)
   - Environment details

---

**See also:** [Troubleshooting](troubleshooting.md) | [Installation](getting-started/installation.md) | [Configuration](getting-started/configuration.md)
