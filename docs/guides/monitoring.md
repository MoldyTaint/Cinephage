[< Back to Index](../INDEX.md) | [Subtitles](subtitles.md) | [Library Management](library-management.md)

# Monitoring Tasks

Cinephage includes automated monitoring tasks that run in the background to keep your library up-to-date.

> **Experimental Feature**: The monitoring system is functional but still being refined. You may encounter scheduling issues or edge cases. Please report any problems on [GitHub Issues](https://github.com/MoldyTaint/Cinephage/issues).

## Task Overview

| Task                    | Default Interval | Description                                         |
|-------------------------|------------------|-----------------------------------------------------|
| Missing Content         | 24 hours         | Searches for movies/series without files            |
| Upgrade Monitoring      | Weekly           | Detects when better quality is available            |
| New Episode Detection   | 1 hour           | Monitors for newly released episodes                |
| Cutoff Unmet            | 24 hours         | Finds content below quality cutoff                  |
| Pending Release Cleanup | 15 minutes       | Removes stuck pending items                         |
| Missing Subtitles       | 6 hours          | Searches for missing subtitles per language profile |
| Subtitle Upgrade        | Daily            | Finds better-scoring subtitles for upgrades         |

---

## Task Details

### Missing Content Search

Automatically searches for movies and TV series marked as "wanted" that don't have any files.

**How it works:**

1. Scans library for items without associated files
2. Queries enabled indexers for matching releases
3. Evaluates results against quality profile
4. Grabs best match if above minimum quality

**Configuration:**

- Interval: Configurable (default 24 hours)
- Respects indexer rate limits
- Only searches for content in monitored state

### Upgrade Monitoring

Checks if better quality releases are available for existing files.

**How it works:**

1. Compares current file quality score against profile cutoff
2. Searches for releases with higher scores
3. Requires minimum improvement threshold to upgrade
4. Replaces existing file when upgrade is grabbed

**Configuration:**

- Interval: Configurable (default weekly)
- Minimum improvement threshold (e.g., 10% better score)
- Respects quality profile cutoff settings

### New Episode Detection

Monitors for newly released TV episodes.

**How it works:**

1. Checks air dates of monitored series
2. Searches for episodes that recently aired
3. Grabs according to quality profile
4. Handles season premieres and finales

**Configuration:**

- Interval: Configurable (default 1 hour)
- Look-ahead window for pre-release searches
- Handles timezone differences

### Cutoff Unmet Search

Finds content that's below your quality profile's defined cutoff.

**How it works:**

1. Identifies files below cutoff score
2. Searches for releases meeting cutoff
3. Only targets items that haven't reached their target quality yet
4. Records per-item activity to task history

> **Note:** This task is distinct from Upgrade Monitoring. CutoffUnmet only searches items **below** your quality cutoff, while Upgrade Monitoring searches **all** items for potential improvements regardless of cutoff status.

**Configuration:**

- Interval: Configurable (default 24 hours)
- Cutoff defined per quality profile
- Can be disabled per item

### Pending Release Cleanup

Removes pending releases that never materialized.

**How it works:**

1. Tracks releases marked as pending
2. Removes entries older than configured age
3. Cleans up stuck or orphaned database entries
4. Prevents UI clutter from failed grabs

**Configuration:**

- Interval: Configurable (default 15 minutes)
- Age threshold before cleanup

### Missing Subtitles Search

Automatically searches for subtitles on media that has files but lacks subtitles required by the language profile.

**How it works:**

1. Finds movies/episodes with files that want subtitles
2. Checks each item against its assigned language profile
3. Considers both external subtitle files AND embedded subtitles in the video container
4. Searches configured providers for missing languages
5. Downloads subtitles meeting the minimum score threshold

**Configuration:**

- Interval: Configurable (default 6 hours)
- Respects language profile minimum score setting
- Processes items in batches to avoid overwhelming providers
- Records downloads in subtitle history

### Subtitle Upgrade Search

Searches for better-scoring subtitles when the language profile allows upgrades.

**How it works:**

1. Finds existing subtitles with match scores below potential improvements
2. Checks if the language profile has `upgradesAllowed` enabled
3. Searches for subtitles with scores at least 10 points better
4. Replaces existing subtitles with higher-quality matches

**Configuration:**

- Interval: Configurable (default daily)
- Requires `upgradesAllowed: true` in language profile
- Minimum improvement threshold: 10 points
- Records upgrades in subtitle history with `action: upgraded`

---

## Configuration

### Accessing Task Settings

Navigate to **Settings > Tasks** to configure:

1. View task status and last run times
2. Set intervals for each task
3. Run tasks manually
4. View execution history and per-item activity

### Global Settings

- **Remember last run**: Tasks remember when they last ran and resume accordingly after restart
- **Background execution**: All tasks run in background threads
- **Error handling**: Failed tasks retry with exponential backoff
- **History retention**: Task history is automatically cleaned up after 30 days

### Per-Item Settings

Override monitoring behavior for specific movies or series:

- **Monitored**: Enable/disable automatic searching
- **Quality Profile**: Assign different profiles per item
- **Search on Add**: Trigger immediate search when adding to library

---

## Manual Triggers

Run any monitoring task manually:

1. Navigate to **Settings > Tasks**
2. Click "Run Now" on the desired task
3. View progress in the task history

Or trigger from media detail pages:

- **Search Missing**: Find and grab missing content
- **Search Upgrade**: Look for quality upgrades
- **Refresh Metadata**: Update TMDB information

---

## Activity Monitoring

Track monitoring task activity:

- **Activity Log**: Real-time view of task progress
- **History**: Past searches and grabs
- **Queue**: Current download queue with status

Access via the Activity menu in the navigation.

---

**See also:** [Quality Profiles](quality-profiles.md) | [Subtitles](subtitles.md) | [Monitoring Internals](../development/monitoring-internals.md)
