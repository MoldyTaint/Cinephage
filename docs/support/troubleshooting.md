# Troubleshooting

Solutions to common issues when using Cinephage.

---

## Installation Issues

### npm install fails

```bash
# Clear cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

Verify Node.js version:

```bash
node --version  # Should be 20+
```

### Build fails

```bash
# Run type checking first
npm run check

# Clear and rebuild
rm -rf node_modules
npm ci
npm run build
```

### npm memory leaks or high memory usage

**Symptoms**: npm install/ci processes consuming excessive memory, system running out of memory, or build failures due to OOM.

**Solutions**:

1. **Use npm configuration** (already configured in `.npmrc`):
   - Limits concurrent connections (`maxsockets=5`)
   - Reduces retry attempts and timeouts
   - Disables progress bars and audit checks

2. **Set Node.js memory limit**:

   ```bash
   export NODE_OPTIONS="--max-old-space-size=4096"
   npm ci
   ```

3. **Clear npm cache**:

   ```bash
   npm cache clean --force
   ```

4. **Use npm ci instead of npm install** (already in use):
   - More memory-efficient for CI/CD and Docker builds
   - Ensures reproducible installs

5. **For Docker builds**: Memory limits are automatically configured in the Dockerfile.

6. **If still having issues**, reduce memory limit further:
   ```bash
   export NODE_OPTIONS="--max-old-space-size=2048"
   npm ci
   ```

### Application won't start (manual npm/node install)

Check if port is in use:

```bash
lsof -i :3000
```

Kill conflicting process or change port in `.env`.

---

## Docker Permission Issues

### "Cannot create directory" or "Permission denied"

**Error**: `cp: can't create directory 'data/indexers': Permission denied` or `Cannot write to config/data directory`

This occurs when the container's user doesn't have write access to host-mounted volumes.

1. Find your host user/group IDs:

   ```bash
   id -u  # Your UID (e.g., 1000)
   id -g  # Your GID (e.g., 1000)
   ```

2. Set these in your `docker-compose.yaml` file or `.env` file if you're passing the environment variables using `env_file` (use your actual values from step 1):

   ```bash
   PUID=<your-uid>
   PGID=<your-gid>
   ```

3. Fix existing directory ownership (replace with your UID:GID):

   ```bash
   sudo chown -R $(id -u):$(id -g) ./config
   ```

   This command automatically uses your current user's IDs.

### "SQLITE_CANTOPEN: unable to open database file"

This is usually caused by the same permission issue above. The database file cannot be created or accessed due to UID/GID mismatch.

Follow the same steps as "Cannot create directory" above.

### Container exits immediately

Check container logs for permission errors:

```bash
docker compose logs cinephage
```

Look for "Cannot write to" or "Permission denied" messages and follow the fix above.

---

## Migration from Legacy /app/data and /app/logs Mounts

If you're upgrading from an older version that used `/app/data` and `/app/logs` mounts:

### Automatic Migration (Recommended)

1. Update your `docker-compose.yaml` to add the `/config` mount **while keeping** the old mounts:

   ```yaml
   volumes:
     - ./config:/config # NEW: Add this line
     - ./data:/app/data # KEEP temporarily
     - ./logs:/app/logs # KEEP temporarily
     - /path/to/media:/media # REQUIRED: Your media library
     - /path/to/downloads:/downloads # REQUIRED: Download client output folder
   ```

2. Start the container:

   ```bash
   docker compose up -d
   ```

3. Check logs to verify successful migration:

   ```bash
   docker compose logs cinephage | grep -i migrat
   ```

   You should see: "Migrating data from /app/data to /config/data..." and "Migrating logs from /app/logs to /config/logs..."

4. Once migration is complete, remove the old mounts from `docker-compose.yaml`:

   ```yaml
   volumes:
     - ./config:/config # Keep this
     # Remove the /app/data and /app/logs lines
     - /path/to/media:/media # REQUIRED: Your media library
     - /path/to/downloads:/downloads # REQUIRED: Download client output folder
   ```

5. Restart the container:

   ```bash
   docker compose up -d
   ```

### Migration Failed Due to Permissions

If you see: "ERROR: Failed to migrate data to /config/data"

1. Temporarily run as root to perform migration:

   ```yaml
   # In docker-compose.yaml, temporarily add:
   user: '0:0' # Run as root
   ```

2. Add PUID/PGID environment variables:

   ```yaml
   environment:
     - PUID=1000
     - PGID=1000
   ```

3. Start container and verify migration:

   ```bash
   docker compose up -d
   docker compose logs cinephage | grep -i migrat
   ```

4. After successful migration, remove the user flag from docker-compose.yaml:

   ```yaml
   user: '0:0' # Run as root
   ```

5. Remove old mounts and restart.

### Manual Migration (Fallback)

If automatic migration doesn't work:

1. Stop the container:

   ```bash
   docker compose down
   ```

2. Manually copy data:

   ```bash
   mkdir -p ./config/data ./config/logs
   cp -a ./data/. ./config/data/
   cp -a ./logs/. ./config/logs/
   ```

3. Fix ownership:

   ```bash
   sudo chown -R $(id -u):$(id -g) ./config
   ```

4. Update `docker-compose.yaml` to use only `/config` mount.

5. Start container:

   ```bash
   docker compose up -d
   ```

### Verifying Migration

After migration, verify your data is accessible:

```bash
# Check database exists
ls -lh ./config/data/cinephage.db

# Check logs
ls -lh ./config/logs/

# Check indexer definitions
ls -lh ./config/data/indexers/definitions/
```

---

## Import Issues

### Downloads complete but files aren't imported

**Symptom:** Download client shows completed, but files never appear in Cinephage library.

**Most common cause:** Download directory not mounted to Cinephage container.

**Solution:**

1. **Verify volume mount** in `docker-compose.yaml`:

   ```yaml
   services:
     cinephage:
       volumes:
         - ./config:/config
         - /path/to/media:/media
         - /path/to/downloads:/downloads # ADD THIS
   ```

2. **Ensure both containers use same host path:**

   ```yaml
   services:
     qbittorrent:
       volumes:
         - /host/path/downloads:/downloads
     cinephage:
       volumes:
         - /host/path/downloads:/downloads # SAME host path
   ```

3. **Test access from both containers:**

   ```bash
   # Check Cinephage can see downloads
   docker exec cinephage ls -la /downloads

   # Check download client's output
   docker exec qbittorrent ls -la /downloads/complete
   ```

4. **Check Cinephage logs for import errors:**

   ```bash
   docker compose logs cinephage | grep -i import
   ```

5. **Verify download client settings:**
   - Settings > Integrations > Download Clients
   - Ensure "Category" or "Download Directory" matches actual output path

### Path mapping errors

**Symptom:** "File not found" errors in import logs.

**Cause:** Download client reports path that doesn't exist in Cinephage container.

**Example:**

- Download client (inside its container): `/data/downloads/movie.mkv`
- Cinephage (inside its container): `/downloads/movie.mkv`
- Same host directory, different container paths

**Solution:**

1. Go to Settings > Integrations > Download Clients
2. Edit your download client
3. Configure Path Mapping:
   - **Remote Path:** `/data/downloads` (path in download client container)
   - **Local Path:** `/downloads` (path in Cinephage container)
4. Save and test

**Tip:** To avoid path mapping, use identical container paths in both services:

```yaml
qbittorrent:
  volumes:
    - /host/downloads:/downloads # Same container path
cinephage:
  volumes:
    - /host/downloads:/downloads # Same container path
```

---

## Database Issues

### Database locked

**Error**: "SQLITE_BUSY: database is locked"

1. Ensure only one instance is running:

   ```bash
   ps aux | grep node
   ```

2. Kill orphaned processes:
   ```bash
   pkill -f "node build/index.js"
   ```

### Database corruption

**Error**: "SQLITE_CORRUPT"

1. Check integrity:

   ```bash
   sqlite3 data/cinephage.db "PRAGMA integrity_check;"
   ```

2. Restore from backup:

   ```bash
   cp backup/cinephage.db data/cinephage.db
   ```

3. If no backup, reset (loses all data):
   ```bash
   rm data/cinephage.db
   npm run dev  # Recreates on startup
   ```

---

## Indexer Issues

### No results from indexer

1. Test indexer in **Settings > Integrations > Indexers**
2. Check if site is accessible in browser
3. Verify indexer is enabled
4. Check health status (may be auto-disabled)

### Rate limiting

Wait for rate limit to reset (usually 1-5 minutes). Reduce search frequency or enable more indexers to spread load.

### Cloudflare protection

Some sites require browser-based solving. Options:

- Try accessing site manually first
- Configure Captcha Solver in Settings > Integrations
- Try a different indexer

### Indexer disabled

Indexers auto-disable after repeated failures:

1. Check health status for error details
2. Fix the underlying issue
3. Manually re-enable in Settings

---

## Download Client Issues

### Cannot connect to qBittorrent

1. Verify WebUI is enabled:
   - qBittorrent > Tools > Options > Web UI
   - Enable "Web User Interface"

2. Check connection details (host, port, credentials)

3. Test access:
   ```bash
   curl http://localhost:8080/api/v2/app/version
   ```

### Downloads not starting

1. Check qBittorrent is running
2. Verify torrent was sent (check Cinephage logs)
3. Verify category exists in qBittorrent
4. Check disk space

### Import not working

1. Verify root folder is accessible
2. Check file permissions
3. For remote clients, configure path mapping

---

## Library Issues

### Files not detected

1. Trigger manual scan: **Settings > Library > Scan**
2. Verify file extensions are supported (.mkv, .mp4, .avi)
3. Check root folder configuration
4. Check logs for scanning errors

### Wrong match

1. Use manual matching in **Library > Unmatched Files**
2. Rename file to expected pattern:
   - Movies: `Movie Name (Year)/Movie Name (Year).mkv`
   - TV: `Series Name/Season 01/Series Name - S01E01.mkv`

3. Use external IDs for guaranteed matching:
   - `Breaking Bad {tvdb-81189}/Season 01/`
   - `Inception {tmdb-27205}/`

### Media info not extracted

1. Install ffprobe:

   ```bash
   sudo apt install ffmpeg
   ```

2. Set `FFPROBE_PATH` in .env if not in system PATH

---

## Subtitle Issues

### No subtitles found

1. Verify providers are enabled
2. Check API keys (OpenSubtitles requires key)
3. Not all content has subtitles available
4. Try different providers

### Wrong language

1. Check language profile configuration
2. Verify language priority order
3. Delete incorrect subtitle and search again

### Provider rate limited

1. Wait for rate limit to reset
2. Enable multiple providers for redundancy
3. Reduce automatic search frequency

---

## Streaming Issues

### Stream won't play

1. Check provider health in streaming settings
2. Try refreshing the stream URL
3. Try a different provider

### .strm files not working

1. **Check External URL configuration**:
   - Settings > Streaming
   - Set to your server's IP and port (e.g., `http://192.168.1.100:3000`)
   - Include port number!

2. **Update existing .strm files** after changing External URL

3. Verify Cinephage is accessible from player's network

---

## Performance Issues

### High memory usage

**If using Docker Compose with `env_file`:** Edit `.env` and reduce worker counts

**If using Docker Compose with environment variables in the compose file:** Add/change values directly in `docker-compose.yml`:

```yaml
environment:
  - WORKER_MAX_STREAMS=5
  - WORKER_MAX_IMPORTS=3
  - WORKER_MAX_LOGS=500
```

**If running without Docker (manual npm/node install):** Set reduced worker counts in `.env`:

```bash
WORKER_MAX_STREAMS=5
WORKER_MAX_IMPORTS=3
WORKER_MAX_LOGS=500
```

Restart Cinephage to apply changes.

### Slow searches

1. Reduce number of enabled indexers
2. Check network latency to indexers
3. Some indexers are inherently slower

---

## Log Files

### Location

- Default: `logs/` in project directory
- Docker: `docker logs cinephage`
- Systemd: `journalctl -u cinephage`

### Useful Commands

```bash
# View recent logs
tail -100 logs/cinephage.log

# Follow logs real-time
tail -f logs/cinephage.log

# Search for errors
grep -i error logs/cinephage.log
```

### Log Rotation

Configured via environment variables:

- `LOG_MAX_SIZE_MB`: Max file size (default: 10MB)
- `LOG_MAX_FILES`: Files to keep (default: 5)

---

**See also:** [FAQ](faq.md) | [Getting Help](getting-help.md) | [Installation](../getting-started/installation.md)
