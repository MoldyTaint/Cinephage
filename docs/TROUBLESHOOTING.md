# Troubleshooting Guide

This guide covers common issues and their solutions when using Cinephage.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Database Issues](#database-issues)
- [Indexer Issues](#indexer-issues)
- [Download Client Issues](#download-client-issues)
- [Library Issues](#library-issues)
- [Subtitle Issues](#subtitle-issues)
- [Performance Issues](#performance-issues)
- [Log Files](#log-files)
- [Debug Mode](#debug-mode)
- [Getting Help](#getting-help)
- [FAQ](#faq)

---

## Installation Issues

### npm install fails

**Symptoms**: Errors during `npm install`

**Solutions**:

1. Clear npm cache:
   ```bash
   npm cache clean --force
   rm -rf node_modules package-lock.json
   npm install
   ```

2. Check Node.js version:
   ```bash
   node --version  # Should be 20+
   ```

3. If using a different package manager, switch to npm:
   ```bash
   rm -rf node_modules yarn.lock pnpm-lock.yaml
   npm install
   ```

### Build fails

**Symptoms**: Errors during `npm run build`

**Solutions**:

1. Run type checking first:
   ```bash
   npm run check
   ```

2. Fix any TypeScript errors reported

3. Ensure all dependencies are installed:
   ```bash
   npm ci
   npm run build
   ```

### Application won't start

**Symptoms**: Error when running `npm run dev` or `npm start`

**Solutions**:

1. Check if port is in use:
   ```bash
   lsof -i :5173  # Development
   lsof -i :3000  # Production
   ```

2. Kill the conflicting process or change the port in `.env`

3. Verify database is initialized:
   ```bash
   npm run db:push
   ```

---

## Database Issues

### Database locked

**Symptoms**: "SQLITE_BUSY: database is locked"

**Solutions**:

1. Ensure only one instance is running:
   ```bash
   ps aux | grep node
   ```

2. Kill any orphaned processes:
   ```bash
   pkill -f "node build/index.js"
   ```

3. Check for pending transactions (restart the application)

### Database corruption

**Symptoms**: "SQLITE_CORRUPT" or unexpected query failures

**Solutions**:

1. Check database integrity:
   ```bash
   sqlite3 data/cinephage.db "PRAGMA integrity_check;"
   ```

2. If corrupted, restore from backup:
   ```bash
   cp backup/cinephage.db data/cinephage.db
   ```

3. If no backup, reset the database:
   ```bash
   rm data/cinephage.db
   npm run db:push
   ```
   Note: This will lose all data.

### Migration errors

**Symptoms**: Errors during `npm run db:push`

**Solutions**:

1. Check for schema conflicts:
   ```bash
   npm run db:generate
   ```

2. Review generated migrations in `drizzle/`

3. For major issues, backup data and reset:
   ```bash
   mv data/cinephage.db data/cinephage.db.old
   npm run db:push
   ```

---

## Indexer Issues

### Indexer not returning results

**Symptoms**: Searches return no results from a specific indexer

**Solutions**:

1. Test the indexer in Settings > Integrations > Indexers
2. Check if the indexer site is accessible in your browser
3. Verify the indexer is enabled
4. Check indexer health status (may be temporarily disabled due to errors)

### Rate limiting

**Symptoms**: "Rate limited" or "Too many requests" errors

**Solutions**:

1. Wait for the rate limit to reset (usually 1-5 minutes)
2. Reduce search frequency
3. Check rate limit settings for the indexer

### Cloudflare protection

**Symptoms**: "Cloudflare protection detected" errors

**Solutions**:

1. Some sites require browser-based solving
2. Try accessing the site manually first
3. The indexer may be temporarily unavailable
4. Consider using Torznab with Prowlarr/FlareSolverr

### Torznab connection failed

**Symptoms**: Cannot connect to Prowlarr/Jackett

**Solutions**:

1. Verify the URL is correct (include `/api` path if required)
2. Check the API key is valid
3. Ensure Prowlarr/Jackett is running and accessible
4. Test the URL in your browser:
   ```
   http://prowlarr:9696/api/v1/indexer?apikey=YOUR_KEY
   ```

### Indexer disabled

**Symptoms**: Indexer shows as disabled in the UI

**Solutions**:

1. Check the health status - may be auto-disabled due to repeated failures
2. Manually re-enable in Settings > Integrations > Indexers
3. Test the indexer to verify it's working
4. Check logs for specific error messages

---

## Download Client Issues

### Cannot connect to qBittorrent

**Symptoms**: "Connection refused" or authentication errors

**Solutions**:

1. Verify qBittorrent WebUI is enabled:
   - qBittorrent > Tools > Options > Web UI
   - Enable "Web User Interface"
   - Set username and password

2. Check connection details:
   - Host (localhost, IP, or hostname)
   - Port (default: 8080)
   - Username and password

3. Verify network access:
   ```bash
   curl http://localhost:8080/api/v2/app/version
   ```

4. Check firewall rules if connecting to remote qBittorrent

### Downloads not starting

**Symptoms**: Grab succeeds but download doesn't appear in qBittorrent

**Solutions**:

1. Check qBittorrent is running
2. Verify the torrent/magnet was sent:
   - Check Cinephage logs for grab confirmation
   - Check qBittorrent for the torrent

3. Verify category exists in qBittorrent

4. Check qBittorrent disk space and download path

### Downloads stuck

**Symptoms**: Downloads stay at 0% or show as stalled

**Solutions**:

1. Check qBittorrent peer connections
2. Verify torrent has seeders
3. Check network/VPN configuration
4. This is typically a qBittorrent/network issue, not Cinephage

### Import not working

**Symptoms**: Completed downloads aren't imported to library

**Solutions**:

1. Verify root folder is configured and accessible
2. Check file permissions on root folder
3. Ensure download path is accessible from Cinephage
4. For remote download clients, configure path mapping

---

## Library Issues

### Files not detected

**Symptoms**: Media files exist but don't appear in library

**Solutions**:

1. Trigger a manual scan: Settings > Library > Scan
2. Verify file extensions are supported (.mkv, .mp4, .avi, etc.)
3. Check root folder configuration
4. Ensure files are not in excluded paths

### Wrong match

**Symptoms**: File matched to incorrect movie/series

**Solutions**:

1. Use manual matching:
   - Library > Unmatched Files
   - Select the file
   - Search and select correct match

2. Rename the file to match expected pattern:
   - Movies: `Movie Name (Year)/Movie Name (Year).mkv`
   - TV: `Series Name/Season 01/Series Name - S01E01.mkv`

### Scan takes too long

**Symptoms**: Library scan is very slow

**Solutions**:

1. Check disk I/O:
   ```bash
   iostat -x 1
   ```

2. Reduce scan frequency in settings

3. Exclude large non-media directories

4. Check for network drive latency (use local paths if possible)

### Media info not extracted

**Symptoms**: Resolution, codec info missing

**Solutions**:

1. Install ffprobe:
   ```bash
   # Ubuntu/Debian
   sudo apt install ffmpeg

   # Verify
   ffprobe -version
   ```

2. Set FFPROBE_PATH in .env if not in system PATH

3. Check ffprobe can read the file:
   ```bash
   ffprobe /path/to/file.mkv
   ```

---

## Subtitle Issues

### No subtitles found

**Symptoms**: Subtitle search returns no results

**Solutions**:

1. Verify at least one provider is enabled
2. Check API keys are valid (OpenSubtitles, SubDL)
3. Try different providers - not all have subtitles for all content
4. Verify the media has correct TMDB match

### Wrong language

**Symptoms**: Downloaded subtitles are wrong language

**Solutions**:

1. Check language profile configuration
2. Verify language priority order
3. Delete incorrect subtitle and search again

### Provider rate limited

**Symptoms**: "Rate limited" errors from subtitle provider

**Solutions**:

1. Wait for rate limit to reset
2. Enable multiple providers for redundancy
3. Reduce automatic search frequency

### Subtitles not synced

**Symptoms**: Subtitles don't match video timing

**Solutions**:

1. Try a different subtitle from search results
2. Use external subtitle sync tools (SubSync, Subtitle Edit)
3. Search for a different release's subtitles

---

## Performance Issues

### High memory usage

**Symptoms**: Application uses excessive RAM

**Solutions**:

1. Reduce worker counts in .env:
   ```
   WORKER_MAX_STREAMS=5
   WORKER_MAX_IMPORTS=3
   ```

2. Reduce log retention:
   ```
   WORKER_MAX_LOGS=500
   ```

3. Restart the application periodically

### Slow searches

**Symptoms**: Indexer searches take too long

**Solutions**:

1. Reduce number of enabled indexers
2. Check network latency to indexer sites
3. Some indexers are inherently slower than others

### High CPU usage

**Symptoms**: CPU spikes during operation

**Solutions**:

1. Reduce concurrent workers
2. Limit simultaneous searches
3. Check for runaway processes:
   ```bash
   top -p $(pgrep -f cinephage)
   ```

---

## Log Files

### Location

- Development: `logs/` in project directory
- Production: Configured via `LOG_DIR` environment variable
- Systemd: `journalctl -u cinephage`

### Log Levels

Logs include various levels:
- ERROR: Problems requiring attention
- WARN: Potential issues
- INFO: Normal operations
- DEBUG: Detailed debugging (if enabled)

### Reading Logs

```bash
# View recent logs
tail -100 logs/cinephage.log

# Follow logs in real-time
tail -f logs/cinephage.log

# Search for errors
grep -i error logs/cinephage.log

# Search for specific indexer
grep "1337x" logs/cinephage.log
```

### Log Rotation

Logs automatically rotate based on:
- `LOG_MAX_SIZE_MB`: Maximum file size (default: 10MB)
- `LOG_MAX_FILES`: Number of files to keep (default: 5)

---

## Debug Mode

For additional debugging information:

1. Check browser developer console (F12)
2. Review server logs in real-time
3. Use Drizzle Studio to inspect database:
   ```bash
   npm run db:studio
   ```

---

## Getting Help

### Before Asking for Help

1. Check this troubleshooting guide
2. Search existing GitHub issues
3. Review logs for error messages
4. Try to reproduce the issue

### Reporting Issues

When opening a GitHub issue, include:

1. **Description**: Clear explanation of the problem
2. **Steps to reproduce**: How to trigger the issue
3. **Expected behavior**: What should happen
4. **Actual behavior**: What actually happens
5. **Environment**:
   - Operating system
   - Node.js version
   - Cinephage version
6. **Logs**: Relevant log excerpts (redact sensitive info)

---

## FAQ

### How do I reset everything?

```bash
# Stop the application
# Backup your data first if needed
rm -rf data/cinephage.db
npm run db:push
# Restart the application
```

### How do I change the port?

Edit `.env`:
```
PORT=8080
```
Restart the application.

### Can I run multiple instances?

Not recommended - SQLite does not handle multiple writers well. Use a single instance.

### How do I backup my configuration?

Important files to backup:
- `data/cinephage.db` - All settings, library, queue
- `.env` - Environment configuration
- `data/indexers/definitions/` - Custom indexer definitions

### Where is data stored?

- Database: `data/cinephage.db`
- Logs: `logs/` (or configured directory)
- Indexer definitions: `data/indexers/definitions/`

### How do I update?

See [DEPLOYMENT.md](DEPLOYMENT.md#updating-cinephage) for update instructions.
