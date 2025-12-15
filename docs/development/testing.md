[< Back to Index](../INDEX.md) | [Architecture](architecture.md) | [Contributing](contributing.md)

# Testing Guide

This document outlines testing procedures and test plans for Cinephage.

---

## Running Tests

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm run test -- src/lib/server/scoring/scoring.test.ts
```

---

## Test Environment Setup

### Prerequisites

1. Cinephage running with database initialized
2. At least one root folder configured
3. At least one quality profile with scoring configured
4. At least one indexer configured and enabled
5. At least one download client configured and enabled

### Test Data Required

- **Movies:** At least 3 movies in library (1 with file, 1 without file, 1 with low-quality file)
- **TV Shows:** At least 1 series with multiple seasons and episodes
- **Profiles:** Quality profile with `upgradesAllowed=true` and `upgradeUntilScore` set

---

## Testing Areas

### 1. Monitoring Specifications

Test the specification pattern implementations:

| Specification | Test Cases |
|---------------|------------|
| MovieMonitoredSpecification | Monitored movie accepts, unmonitored rejects |
| EpisodeMonitoredSpecification | Cascading logic (series/season/episode) |
| MissingContentSpecification | No file accepts, has file rejects |
| CutoffUnmetSpecification | Below/at/above cutoff, upgrades disabled |
| UpgradeableSpecification | Quality improvement thresholds |
| NewEpisodeSpecification | Air date window validation |

### 2. Search Orchestration

Test multi-indexer search and result handling:

- Missing movies search filters correctly
- Missing episodes respects cascading monitoring
- Upgrade search respects cutoff settings
- New episode search uses correct time window
- Auto-grab triggers at score threshold
- Rate limiting delays between searches

### 3. Task Executors

Test each automated task:

- Missing content task finds and grabs releases
- Upgrade monitor task respects maxItems limit
- New episode task searches recently aired
- Cutoff unmet task marks items as upgrades

### 4. Import & Auto-Replace

Test file import handling:

- Movie upgrade replaces old file
- Episode upgrade replaces old file
- Multi-episode pack replaces multiple files
- Failed deletions don't block imports

### 5. Scheduler

Test the monitoring scheduler:

- Initialization creates correct timers
- Disabled setting prevents scheduling
- Concurrent execution prevention
- Settings update restarts scheduler
- Manual triggers work correctly

---

## Monitoring System Test Plan

### Core Monitoring Logic Tests

#### Movie Monitoring Specification

| Test Case | Movie Monitored | Expected Result |
|-----------|-----------------|-----------------|
| Monitored movie | true | Accept |
| Unmonitored movie | false | Reject (NOT_MONITORED) |

#### Episode Monitoring Specification (Cascading)

| Test Case | Series | Season | Episode | Expected Result |
|-----------|--------|--------|---------|-----------------|
| All monitored | true | true | true | Accept |
| Series unmonitored | false | true | true | Reject (SERIES_NOT_MONITORED) |
| Season unmonitored | true | false | true | Reject (SEASON_NOT_MONITORED) |
| Episode unmonitored | true | true | false | Reject (NOT_MONITORED) |

#### Cutoff Unmet Specification

| Test Case | Upgrades Allowed | Cutoff Score | File Score | Expected Result |
|-----------|------------------|--------------|------------|-----------------|
| Below cutoff | true | 100 | 50 | Accept |
| At cutoff | true | 100 | 100 | Reject (ALREADY_AT_CUTOFF) |
| Above cutoff | true | 100 | 150 | Reject (ALREADY_AT_CUTOFF) |
| No cutoff | true | 0 | 50 | Accept |
| Upgrades disabled | false | 100 | 50 | Reject (UPGRADES_NOT_ALLOWED) |

#### Upgradeable Specification

| Test Case | Existing Score | New Score | Min Increment | Cutoff | Expected |
|-----------|----------------|-----------|---------------|--------|----------|
| Better quality | 50 | 100 | 10 | 150 | Accept |
| Small improvement | 50 | 55 | 10 | 150 | Reject (IMPROVEMENT_TOO_SMALL) |
| Worse quality | 100 | 50 | 10 | 150 | Reject (QUALITY_NOT_BETTER) |
| Exceeds cutoff | 50 | 160 | 10 | 150 | Reject (ALREADY_AT_CUTOFF) |

---

## End-to-End Test Flows

### Complete Missing Movie Flow

1. Add monitored movie with no file
2. Wait for/trigger missing content task
3. Verify movie searched
4. Verify release grabbed (if available)
5. Wait for download completion
6. Verify file imported
7. Verify movie.hasFile = true
8. Check history records

### Complete Upgrade Flow

1. Create movie with low-quality file (score 50)
2. Set cutoff to 100
3. Wait for/trigger upgrade task
4. Verify upgrade detected and grabbed
5. Wait for download
6. Verify old file deleted
7. Verify new file imported
8. Verify movie still has file (no gap)
9. Check history shows upgrade

### Complete New Episode Flow

1. Create monitored series
2. Add episode with airDate = now
3. Wait for/trigger new episode task (1h interval)
4. Verify episode searched
5. Verify release grabbed
6. Wait for download and import
7. Verify episode.hasFile = true

### Cascading Monitoring Test

1. Create series (monitored)
2. Create Season 1 (monitored)
3. Create Season 2 (NOT monitored)
4. Add episodes to both seasons (all monitored)
5. Trigger missing episode search
6. Verify only Season 1 episodes searched
7. Verify Season 2 episodes skipped (season blocks)
8. Enable Season 2 monitoring
9. Trigger search again
10. Verify Season 2 episodes now searched

---

## Performance Testing

### Large Library Performance

- Test with 1000+ monitored items
- Monitor execution time
- Check memory usage
- Verify rate limiting prevents indexer overload

### Concurrent Task Execution

- Trigger all 4 tasks simultaneously
- Verify no database deadlocks
- Verify results are correct

---

## Known Limitations

1. **Scheduler Persistence:** Last run times are in-memory only, reset on server restart
2. **Search Throttling:** Fixed delays, not adaptive based on indexer response
3. **History Cleanup:** No automatic cleanup of old monitoring history records
4. **Concurrent Imports:** Multiple upgrades for same item not handled
5. **File Locks:** Old file deletion may fail if file is locked

---

## Acceptance Criteria

The system is considered ready when:

- All specifications pass unit tests
- All search orchestration scenarios work correctly
- All task executors complete successfully
- Auto-replace deletes old files and imports new ones
- Scheduler starts/stops/updates correctly
- Multi-level monitoring API works as expected
- Dashboard UI displays and updates correctly
- Manual triggers work from dashboard
- End-to-end flows complete successfully
- Performance acceptable with large libraries
- No memory leaks or resource exhaustion
- Error handling graceful throughout

---

**See also:** [Architecture](architecture.md) | [Contributing](contributing.md) | [Monitoring Internals](monitoring-internals.md)
