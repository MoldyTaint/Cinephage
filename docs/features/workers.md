# Workers

Cinephage uses a **Worker System** to manage background tasks. All long-running operations — imports, scans, searches, streaming — run through workers with concurrency limits, progress tracking, and cancellation support.

---

## What Are Workers?

Workers are background processes that handle:

- **Heavy operations** — File scanning, media analysis
- **External requests** — Indexer searches, subtitle downloads
- **Long-running tasks** — Stream extraction, portal scanning
- **Scheduled jobs** — Monitoring, upgrades, cleanup

### Why Workers?

Without workers:

- UI would freeze during long operations
- No way to track progress
- Can't cancel running operations
- Risk of overwhelming system resources

With workers:

- **Non-blocking** — UI stays responsive
- **Progress tracking** — See exactly what's happening
- **Cancellable** — Stop tasks if needed
- **Resource controlled** — Concurrency limits prevent overload

---

## Worker Types

Cinephage has 7 worker types, each handling specific tasks:

| Worker              | Purpose               | Typical Tasks                                   |
| ------------------- | --------------------- | ----------------------------------------------- |
| **Stream**          | Stream URL extraction | Resolve streaming providers, extract video URLs |
| **Import**          | Media import          | Move files, match to TMDB, extract metadata     |
| **Scan**            | Library scanning      | Scan root folders, detect new/changed files     |
| **Monitoring**      | Automated searches    | Missing content, upgrades, new episodes         |
| **Search**          | Manual searches       | Indexer searches for movies/episodes            |
| **Subtitle Search** | Subtitle downloads    | Search providers, download subtitles            |
| **Portal Scan**     | Live TV scanning      | Scan Stalker portals for accounts               |

---

## Concurrency Limits

Each worker type has a maximum concurrent tasks:

### Default Limits

```bash
WORKER_MAX_STREAMS=10          # Stream extraction
WORKER_MAX_IMPORTS=5           # File imports
WORKER_MAX_SCANS=2             # Library scans
WORKER_MAX_MONITORING=5        # Monitoring tasks
WORKER_MAX_SEARCH=3            # Manual searches
WORKER_MAX_SUBTITLE_SEARCH=3   # Subtitle searches
WORKER_MAX_PORTAL_SCANS=2      # Portal scans
```

### Why Limits Matter

- **Prevents overload** — Too many concurrent tasks = slow performance
- **Fair resource sharing** — Different task types get appropriate resources
- **Priority handling** — UI searches can interrupt background tasks

### Adjusting Limits

Edit in `.env` file:

```bash
# Reduce if low on memory
WORKER_MAX_IMPORTS=3
WORKER_MAX_STREAMS=5

# Increase if powerful server
WORKER_MAX_SCANS=4
WORKER_MAX_SEARCH=5
```

Restart Cinephage to apply changes.

---

## Worker Lifecycle

### 1. Task Created

When you trigger an action:

```
User clicks "Search" → Task created → Added to queue
```

### 2. Queued

If all workers of that type are busy:

```
Task queued → Waiting for available worker
Position in queue: 3
```

### 3. Running

Worker picks up task:

```
Worker #2 assigned → Task running
Progress: 45% | Status: Searching indexers...
```

### 4. Completed/Failed/Cancelled

Task finishes:

```
✓ Completed — 3 releases found
✗ Failed — Indexer timeout
⊘ Cancelled — User cancelled
```

---

## Viewing Workers

### Active Workers Page

Navigate to **System > Workers**:

| Column       | Description                      |
| ------------ | -------------------------------- |
| **Type**     | Worker type (import, scan, etc.) |
| **Task**     | What it's doing                  |
| **Status**   | Running, Queued, Completed       |
| **Progress** | Percentage complete              |
| **Started**  | When task began                  |
| **Actions**  | Cancel / View Logs               |

### Task Details

Click on a task to see:

- **Full progress** — Step-by-step breakdown
- **Live logs** — Real-time log output
- **Cancel button** — Stop the task
- **History** — Previous runs of same type

---

## Cancelling Tasks

### When to Cancel

- **Taking too long** — Stuck on slow indexer
- **Wrong action** — Started search by mistake
- **Need to restart** — Configuration changed
- **System overloaded** — Free up resources

### How to Cancel

1. Go to **System > Workers**
2. Find the running task
3. Click **Cancel**
4. Confirm cancellation

### What Happens

- **Graceful stop** — Task stops at next checkpoint
- **Partial results** — Any completed work is saved
- **Cleanup** — Temporary files removed
- **Log saved** — Cancellation reason logged

---

## Worker Logs

Each worker maintains its own log:

### Viewing Logs

**System > Workers > [Task] > Logs**

```
[10:23:45] Starting import task
[10:23:46] Analyzing file: Movie.2023.1080p.mkv
[10:23:47] Extracting media info with ffprobe
[10:23:48] Matching to TMDB...
[10:23:49] Found match: Movie (2023) - TMDB ID: 12345
[10:23:50] Moving file to library
[10:23:51] ✓ Import complete
```

### Log Retention

Logs are kept for completed tasks:

```bash
WORKER_MAX_LOGS=1000    # Maximum log entries to keep
WORKER_CLEANUP_MS=1800000  # Clean up after 30 minutes
```

Old logs are automatically purged to save memory.

---

## Worker Queue

### Queue Management

When workers are at capacity, new tasks queue:

```
Active Workers:
  Import: 3/5 running
  Scan: 2/2 running (QUEUE: 1 waiting)
```

### Queue Priority

Tasks are processed in order:

1. **Manual tasks** — User-initiated (highest priority)
2. **Monitoring** — Scheduled tasks
3. **Background** — Cleanup, maintenance

### Queue Limits

Each worker type has a max queue size:

- **Import**: 20 queued
- **Scan**: 5 queued
- **Search**: 50 queued
- **Others**: 10 queued

Excess tasks are rejected with error message.

---

## Troubleshooting

### Workers Not Starting

If tasks stay "Pending":

1. **Check worker limits** — May be at capacity
2. **Check queue** — May be backed up
3. **Restart Cinephage** — Worker manager may be stuck
4. **Check logs** — Look for worker errors

### Task Stuck at 0%

If task doesn't progress:

1. **Check dependencies** — Download client offline? Indexer failing?
2. **Check resources** — Disk full? Network down?
3. **Cancel and retry** — May be transient issue
4. **Check logs** — Look for error messages

### "All Workers Busy" Error

If you see this message:

1. **Wait** — Tasks will complete eventually
2. **Cancel non-essential** — Free up a worker slot
3. **Increase limits** — If this happens often, raise WORKER*MAX*\*

### High Memory Usage

Workers can consume memory:

1. **Reduce limits** — Lower WORKER*MAX*\* values
2. **Check for leaks** — Tasks that never complete
3. **Restart Cinephage** — Clears worker memory
4. **Monitor patterns** — Specific task type causing issues?

---

## Best Practices

### Don't Overload

Resist the urge to set all limits to 100:

- **Start conservative** — Use defaults
- **Monitor performance** — Check CPU/memory
- **Increase gradually** — +1 at a time

### Cancel When Needed

Don't let broken tasks run forever:

- **Set timeouts** — Tasks auto-cancel after 1 hour
- **Monitor actively** — Check workers page regularly
- **Cancel stuck tasks** — Don't wait indefinitely

### Review Logs

When tasks fail, check logs:

- **Error messages** — Usually explain the problem
- **Stack traces** — For developer debugging
- **Progress history** — See where it failed

---

## Environment Variables

Complete list of worker settings:

```bash
# Concurrency limits
WORKER_MAX_STREAMS=10
WORKER_MAX_IMPORTS=5
WORKER_MAX_SCANS=2
WORKER_MAX_MONITORING=5
WORKER_MAX_SEARCH=3
WORKER_MAX_SUBTITLE_SEARCH=3
WORKER_MAX_PORTAL_SCANS=2

# Cleanup settings
WORKER_CLEANUP_MS=1800000      # Remove completed tasks after 30 min
WORKER_MAX_LOGS=1000           # Max log entries per worker type
```

---

## See Also

- [Monitoring](monitoring.md) — Automated tasks that use workers
- [Performance Tuning](../advanced/performance-tuning.md) — Optimize worker settings
- [Troubleshooting](../support/troubleshooting.md) — General troubleshooting
