[< Back to Index](../INDEX.md) | [Previous: Configuration](configuration.md) | [Library Management](../guides/library-management.md)

# First Steps

After completing installation and configuration, this guide walks you through adding your first media to Cinephage.

---

## Adding Your First Movie

### 1. Browse for a Movie

1. Click **Discover** in the navigation
2. Browse trending movies or use the search bar
3. Click on a movie to view details

### 2. Add to Library

1. On the movie detail page, click **Add to Library**
2. Configure options:
   - **Root Folder**: Where to store the file (e.g., `/media/movies`)
   - **Quality Profile**: Which profile to use (Quality, Balanced, Compact, or Streamer)
   - **Monitored**: Enable to automatically search for releases
3. Click **Add**

### 3. Search for Releases

If "Search on Add" was enabled, Cinephage automatically searches. Otherwise:

1. Go to **Library > Movies**
2. Click on your movie
3. Click **Search** to find releases
4. Results show:
   - Release name
   - Quality score
   - Size
   - Seeders
   - Indexer source

### 4. Grab a Release

1. Review the search results
2. Click **Grab** on your preferred release
3. The release is sent to your download client

### 5. Monitor Download Progress

1. Go to **Activity > Queue** to see download status
2. Once complete, Cinephage automatically imports the file
3. Check **Library > Movies** to confirm the file is imported

---

## Adding Your First TV Series

### 1. Browse for a Series

1. Click **Discover** in the navigation
2. Switch to **TV Shows** tab
3. Browse trending or search for a series
4. Click on a series to view details

### 2. Add to Library

1. On the series detail page, click **Add to Library**
2. Configure options:
   - **Root Folder**: Where to store files (e.g., `/media/tv`)
   - **Quality Profile**: Which profile to use
   - **Monitored**: Enable for automatic searches
3. Choose which seasons to monitor:
   - All seasons
   - Future seasons only
   - Specific seasons
4. Click **Add**

### 3. Understanding Season/Episode Monitoring

Cinephage uses cascading monitoring for TV:

| Series      | Season      | Episode   | Result          |
| ----------- | ----------- | --------- | --------------- |
| Monitored   | Monitored   | Monitored | Will search     |
| Monitored   | Unmonitored | Monitored | Will NOT search |
| Unmonitored | Monitored   | Monitored | Will NOT search |

All three levels must be monitored for an episode to be searched.

### 4. Search for Episodes

1. Go to **Library > Series**
2. Click on your series
3. Navigate to a season
4. Click **Search Season** or search individual episodes
5. Review results and grab releases

### 5. Monitor New Episodes

When new episodes air:

1. Cinephage automatically detects them (if monitoring is enabled)
2. The New Episode Check task searches within 1 hour of air time
3. Episodes are grabbed and downloaded automatically

---

## Understanding the Download Queue

### Queue Status

View current downloads at **Activity > Queue**:

| Status      | Meaning                       |
| ----------- | ----------------------------- |
| Queued      | Waiting for download client   |
| Downloading | In progress                   |
| Importing   | Download complete, processing |
| Completed   | Successfully imported         |
| Failed      | Error occurred                |

### Queue Actions

- **Retry**: Re-attempt a failed download
- **Remove**: Cancel download
- **Blocklist**: Cancel and prevent re-download of this release

---

## Understanding Quality Scores

Each release is scored based on multiple factors:

| Factor              | Max Points |
| ------------------- | ---------- |
| Resolution + Source | 20,000     |
| Audio Codec         | 2,000      |
| HDR Format          | 1,000      |
| Release Group       | 500        |

Higher scores indicate better quality. See [Quality Profiles](../guides/quality-profiles.md) for details.

---

## Automatic vs Manual

### Automatic Mode

When monitoring is enabled:

1. Cinephage periodically searches for missing content
2. New episodes are grabbed automatically
3. Quality upgrades happen when better releases appear

Configure intervals in **Settings > Tasks**.

### Manual Mode

When monitoring is disabled:

1. You search manually from the library
2. You choose which releases to grab
3. Full control over what gets downloaded

---

## Next Steps

Now that you've added your first media:

- Learn about [Library Management](../guides/library-management.md)
- Configure [Quality Profiles](../guides/quality-profiles.md)
- Set up [Subtitle Providers](../guides/subtitles.md)
- Explore [Monitoring Tasks](../guides/monitoring.md)

---

**See also:** [Configuration](configuration.md) | [Library Management](../guides/library-management.md) | [Quality Profiles](../guides/quality-profiles.md)
