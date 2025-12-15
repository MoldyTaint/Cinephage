[< Back to Index](../INDEX.md) | [Previous: Installation](installation.md) | [Next: First Steps](first-steps.md)

# Configuration

This guide covers first-run setup after installing Cinephage.

---

## First Run Setup

After starting Cinephage for the first time, complete these configuration steps in the web UI.

### 1. TMDB API Key

Required for movie and TV metadata.

1. Get a free API key at https://www.themoviedb.org/settings/api
2. Navigate to **Settings > General**
3. Enter your TMDB API key
4. The key is validated automatically

### 2. Download Client

Configure your download client for grabbing releases.

> **Note**: Currently supported: qBittorrent, SABnzbd, NZBGet. See the [Roadmap](../roadmap.md) for planned additions.

1. Navigate to **Settings > Integrations > Download Clients**
2. Click **Add Download Client**
3. Enter connection details:
   - **Host**: `localhost` or IP address
   - **Port**: Default WebUI port (8080 for qBittorrent)
   - **Username**: WebUI username
   - **Password**: WebUI password
4. Test the connection before saving

**qBittorrent Setup:**

- WebUI must be enabled (Options > Web UI > Enable)
- "Bypass authentication for localhost" can be used for local installs
- If Cinephage runs remotely, whitelist its IP in qBittorrent

### 3. Root Folders

Define where media files are stored.

1. Navigate to **Settings > General**
2. Add root folders:
   - One folder for movies (e.g., `/media/movies`)
   - One folder for TV series (e.g., `/media/tv`)
3. Cinephage organizes downloads into these locations automatically

**Path Mapping (Remote Clients):**

If your download client and Cinephage see different paths for the same storage:

| Download Client Path  | Cinephage Path        |
|-----------------------|-----------------------|
| `/downloads/movies`   | `/mnt/media/movies`   |

Configure path mappings in **Settings > Integrations > Download Clients**.

### 4. Indexers

Enable torrent and usenet search sources.

1. Navigate to **Settings > Integrations > Indexers**
2. Enable desired indexers (public indexers work out of the box)
3. For private trackers, enter API keys or credentials
4. Test each indexer to verify connectivity

See [Indexers Guide](../guides/indexers.md) for detailed indexer setup.

### 5. Quality Profile (Optional)

Review and customize quality preferences.

1. Navigate to **Settings > Profiles**
2. Review built-in profiles (Best, Efficient, Micro, Streaming)
3. Create custom profiles if the defaults don't fit your needs

See [Quality Profiles Guide](../guides/quality-profiles.md) for scoring details.

---

## Environment Variables

For environment configuration options including logging, worker settings, and advanced configuration, see the [Environment Variables Reference](../reference/environment-variables.md).

---

## Next Steps

After configuration, continue to [First Steps](first-steps.md) to add your first media.

---

**See also:** [Installation](installation.md) | [Environment Variables](../reference/environment-variables.md) | [Troubleshooting](../troubleshooting.md)
