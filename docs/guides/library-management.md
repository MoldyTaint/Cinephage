[< Back to Index](../INDEX.md) | [Quality Profiles](quality-profiles.md) | [Monitoring](monitoring.md)

# Library Management

This guide covers how Cinephage manages your media library, including scanning, matching, and organization.

---

## Library Scanning

Cinephage uses two methods to detect media files:

### Real-Time File Watching

Cinephage monitors root folders for changes using file system events:

- New files are detected immediately
- Moved or renamed files are tracked
- Deleted files are detected and library updated

### Scheduled Scans

In addition to real-time watching, scheduled scans ensure nothing is missed:

1. Navigate to **Settings > Tasks**
2. Configure scan interval
3. Scans run automatically at the configured time

### Manual Scan

Trigger a scan manually:

1. Go to **Settings > Library**
2. Click **Scan Library**
3. Optionally specify a path for targeted scanning

---

## Root Folders

Root folders define where your media is stored.

### Adding Root Folders

1. Navigate to **Settings > General**
2. Click **Add Root Folder**
3. Browse to select the folder path
4. Assign a name (e.g., "Movies", "TV Shows")

### Best Practices

- Use separate root folders for movies and TV shows
- Avoid nested root folders
- Ensure Cinephage has read/write permissions
- For remote storage, use mounted paths (not network URLs)

### Path Mapping

If your download client sees different paths than Cinephage:

| Download Client | Cinephage | Action |
|-----------------|-----------|--------|
| `/downloads/movies` | `/mnt/media/movies` | Add path mapping |

Configure in **Settings > Integrations > Download Clients**.

---

## File Matching

When scanning, Cinephage matches files to TMDB entries.

### Automatic Matching

Cinephage uses several methods to identify content:

1. **External IDs in path** (most reliable)
2. **Folder/file name parsing**
3. **Year matching**
4. **Season/episode detection**

### External ID Matching

For guaranteed matching, include external IDs in folder or file names:

**Movies:**
```
Inception {tmdb-27205}/Inception (2010).mkv
The.Godfather.1972.tt0068646.1080p.BluRay.mkv
```

**TV Shows:**
```
Breaking Bad {tvdb-81189}/Season 01/Breaking Bad - S01E01.mkv
Game of Thrones [imdb-tt0944947]/Season 01/...
```

**Supported formats:**
- `{id-12345}` - Curly braces
- `[id-12345]` - Square brackets
- `.id-12345.` - Dots
- `id-12345` - Plain

**Supported ID types:**
- `tmdb-` - TMDB ID (movies and TV)
- `tvdb-` - TVDB ID (TV shows)
- `imdb-` or `tt` - IMDB ID

### Name-Based Matching

If no external ID is found, Cinephage parses names:

**Movies:**
```
Movie Name (Year)/Movie Name (Year) [Quality].mkv
Movie.Name.Year.Quality.Group.mkv
```

**TV Shows:**
```
Series Name/Season 01/Series Name - S01E01 - Episode Title.mkv
Series.Name.S01E01.Episode.Title.Quality.mkv
```

### Handling Mismatches

When a file is incorrectly matched:

1. Go to **Library > Unmatched Files** (if not matched) or the item's detail page
2. Click **Manual Match**
3. Search for the correct title
4. Select the correct match

---

## Media Info Extraction

Cinephage extracts technical information from media files using ffprobe.

### Extracted Information

- Resolution (1080p, 2160p, etc.)
- Video codec (H.264, H.265, AV1)
- Audio codec and channels
- HDR format (Dolby Vision, HDR10+)
- Subtitle tracks (language, format)
- Runtime

### Requirements

Install ffprobe for media info extraction:

```bash
# Ubuntu/Debian
sudo apt install ffmpeg

# macOS
brew install ffmpeg

# Windows
Download from https://ffmpeg.org/download.html
```

If ffprobe is not in PATH, set `FFPROBE_PATH` in `.env`.

### Without ffprobe

If ffprobe is not available:

- Basic file information is still recorded
- Resolution and codec must be inferred from filename
- No embedded subtitle detection

---

## File Organization

### Naming Conventions

Cinephage organizes imported files using naming templates:

**Movies:**
```
{Movie Title} ({Year})/{Movie Title} ({Year}) - {Quality}.{ext}
```

**TV Shows:**
```
{Series Title}/Season {Season}/
{Series Title} - S{Season}E{Episode} - {Episode Title}.{ext}
```

### Configuring Naming

1. Go to **Settings > Naming**
2. Customize templates using available tokens
3. Preview how files will be named

### Available Tokens

| Token | Description | Example |
|-------|-------------|---------|
| `{Movie Title}` | Movie name | Inception |
| `{Year}` | Release year | 2010 |
| `{Quality}` | Quality string | 1080p BluRay |
| `{Series Title}` | Series name | Breaking Bad |
| `{Season}` | Season number | 01 |
| `{Episode}` | Episode number | 01 |
| `{Episode Title}` | Episode name | Pilot |

---

## Unmatched Files

Files that couldn't be automatically matched appear in the unmatched queue.

### Viewing Unmatched Files

1. Go to **Library > Unmatched Files**
2. See list of files awaiting matching

### Manually Matching

1. Select an unmatched file
2. Search for the correct movie/series
3. Select the match
4. File is moved and organized

### Common Causes of Mismatches

- Unusual naming conventions
- Foreign language titles
- Very new releases not yet in TMDB
- Files in wrong root folder type

---

## Library Statistics

View library statistics:

- Total movies/series
- Files with/without quality data
- Storage usage per root folder
- Missing vs downloaded content

Access via **Library** dashboard.

---

## Maintenance

### Cleaning Up

- Remove items no longer wanted from library
- Delete orphaned database entries
- Clear old import history

### Database Optimization

The SQLite database occasionally benefits from optimization:

```bash
sqlite3 data/cinephage.db "VACUUM;"
```

### Log Rotation

Library scan logs rotate automatically based on settings:
- `LOG_MAX_SIZE_MB`: Max file size before rotation
- `LOG_MAX_FILES`: Number of log files to keep

---

**See also:** [First Steps](../getting-started/first-steps.md) | [Quality Profiles](quality-profiles.md) | [Troubleshooting](../troubleshooting.md)
