# Download Queue Bugs Fix Plan

## Overview

This plan addresses 7 bugs discovered during investigation of the download queue system.

## Bug Summary

| ID      | Severity | Bug                              | Root Cause                                                              |
| ------- | -------- | -------------------------------- | ----------------------------------------------------------------------- |
| P0      | Critical | Status Overwrite Bug             | `updateQueueItem()` unconditionally overwrites `failed` status          |
| P9      | High     | Zero Progress Seeding Bug        | `mapDownloadStatusToQueueStatus()` requires `progress >= 1` for seeding |
| P3      | Medium   | OST/Soundtrack Not Filtered      | Pattern too narrow                                                      |
| P6      | Medium   | Game Repacks Not Filtered        | No filter exists                                                        |
| P7      | Medium   | ISO/Disc Images Not Filtered     | No filter exists                                                        |
| P2      | Medium   | Extensionless Files Not Imported | Only extension-based detection                                          |
| Cleanup | Low      | Problematic Queue Items          | Need manual cleanup                                                     |

---

## Phase 1: Critical Bug Fixes

### P0 - Status Overwrite Bug

**File:** `src/lib/server/downloadClients/monitoring/DownloadMonitorService.ts`
**Location:** Lines 1063-1083

**Current code:**

```typescript
// Update status if changed
if (statusChanged) {
	updates.status = newStatus;

	// Set startedAt on first download progress
	if (newStatus === 'downloading' && !queueItem.startedAt) {
		updates.startedAt = now;
	}

	// Set completedAt when finished downloading
	if (newStatus === 'completed' || newStatus === 'seeding') {
		if (!queueItem.completedAt) {
			updates.completedAt = now;
		}
	}

	// Capture error message when download fails
	if (newStatus === 'failed' && download.errorMessage) {
		updates.errorMessage = download.errorMessage;
	}
}
```

**Replace with:**

```typescript
// Update status if changed
if (statusChanged) {
	// Preserve "sticky" statuses that shouldn't be overwritten by download client polling
	// - 'failed': Only recover if download becomes actively downloading/queued again
	// - 'importing': Don't interrupt active import process
	const stickyStatuses = ['failed', 'importing'];
	const isRecovering = newStatus === 'downloading' || newStatus === 'queued';
	const shouldPreserveStatus = stickyStatuses.includes(queueItem.status) && !isRecovering;

	if (!shouldPreserveStatus) {
		updates.status = newStatus;

		// Set startedAt on first download progress
		if (newStatus === 'downloading' && !queueItem.startedAt) {
			updates.startedAt = now;
		}

		// Set completedAt when finished downloading
		if (newStatus === 'completed' || newStatus === 'seeding') {
			if (!queueItem.completedAt) {
				updates.completedAt = now;
			}
		}

		// Capture error message when download fails
		if (newStatus === 'failed' && download.errorMessage) {
			updates.errorMessage = download.errorMessage;
		}
	}
}
```

---

### P9 - Zero Progress Seeding Bug

**File:** `src/lib/server/downloadClients/monitoring/DownloadMonitorService.ts`
**Location:** Lines 119-120

**Current code:**

```typescript
case 'seeding':
    return safeProgress >= 1 ? 'seeding' : 'downloading';
```

**Replace with:**

```typescript
case 'seeding':
    // Trust the client - if it says seeding, it's seeding
    // Zero progress can happen with empty/skipped torrents
    return 'seeding';
```

---

## Phase 2: Search Filtering Improvements

### P3 - Strengthen OST/Soundtrack Filter

**File:** `src/lib/server/scoring/formats/banned.ts`
**Location:** Lines 184-185

**Current pattern:**

```typescript
pattern: '\\b(OST|Original[. ](Motion[. ]Picture|Television|Series)[. ]Soundtrack|Soundtrack)\\b';
```

**Replace with:**

```typescript
pattern: '\\b(OST|O\\.?S\\.?T\\.?|Original[. ]?(Motion[. ]?Picture|Television|Series|Film|Game)?[. ]?Soundtrack|Soundtrack|Film[. ]?Score|Motion[. ]?Picture[. ]?Score)\\b|-OST-';
```

---

### P6 - Add Game Repack Filter

**File:** `src/lib/server/scoring/formats/banned.ts`
**Location:** After line 191 (after BANNED_MUSIC)

**Add new array:**

```typescript
/**
 * Game/Software releases
 * These are not video content - should be blocked for movie/TV searches
 */
export const BANNED_GAMES: CustomFormat[] = [
	{
		id: 'banned-game-repack',
		name: 'Game Repack',
		description: 'Game repack releases (not video content)',
		category: 'banned',
		tags: ['Banned', 'Game', 'Software'],
		conditions: [
			{
				name: 'Game Repack',
				type: 'release_title',
				pattern:
					'\\b(FitGirl|DODI|ElAmigos|CODEX|SKIDROW|PLAZA|GOG|Goldberg|TiNYiSO|EMPRESS|RUNE|CPY|RELOADED|DARKSiDERS|HOODLUM|RAZOR1911)\\b|\\bRePack\\b.*\\b(PC|Game)\\b|\\b(PC|Game)[. ]RePack\\b',
				required: true,
				negate: false
			}
		]
	}
];
```

**Update ALL_BANNED_FORMATS (line 267-273):**

```typescript
export const ALL_BANNED_FORMATS: CustomFormat[] = [
	...BANNED_RETAGGING,
	...BANNED_FAKE_HDR,
	...BANNED_CONTENT,
	...BANNED_MUSIC,
	...BANNED_GAMES,
	...BANNED_SOURCES
];
```

---

### P7 - Add ISO/Disc Image Filter

**File:** `src/lib/server/scoring/formats/banned.ts`
**Location:** Add to BANNED_CONTENT array (after line 166, before closing bracket)

**Add new entry:**

```typescript
{
    id: 'banned-disc-image',
    name: 'Disc Image',
    description: 'ISO/disc image files (not directly playable)',
    category: 'banned',
    tags: ['Banned', 'ISO', 'Disc'],
    conditions: [
        {
            name: 'Disc Image',
            type: 'release_title',
            pattern: '\\.(iso|img|bin|nrg|mdf)\\b|\\b(DVD|BD|Blu-?ray)[. -]?ISO\\b',
            required: true,
            negate: false
        }
    ]
}
```

---

## Phase 3: Import Improvement

### P2 - Magic Number Detection for Extensionless Files

**File:** `src/lib/server/downloadClients/import/FileTransfer.ts`

**Add imports at top:**

```typescript
import { open } from 'node:fs/promises';
```

**Add after line 411 (after isVideoFile function):**

```typescript
/**
 * Video file magic number signatures
 */
const VIDEO_MAGIC_SIGNATURES = [
	{ magic: Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), offset: 0, format: 'mkv/webm' },
	{ magic: Buffer.from('ftyp'), offset: 4, format: 'mp4/mov/m4v' },
	{
		magic: Buffer.from('RIFF'),
		offset: 0,
		format: 'avi',
		extra: { magic: Buffer.from('AVI '), offset: 8 }
	},
	{ magic: Buffer.from('FLV'), offset: 0, format: 'flv' }
];

/**
 * Check if a file is a video by reading its magic bytes.
 * Used as fallback when file has no extension.
 */
export async function isVideoFileByMagic(filePath: string): Promise<boolean> {
	let fd;
	try {
		fd = await open(filePath, 'r');
		const buffer = Buffer.alloc(12);
		await fd.read(buffer, 0, 12, 0);

		for (const sig of VIDEO_MAGIC_SIGNATURES) {
			const slice = buffer.subarray(sig.offset, sig.offset + sig.magic.length);
			if (slice.equals(sig.magic)) {
				// Additional check for formats that need secondary verification (like AVI)
				if (sig.extra) {
					const extraSlice = buffer.subarray(
						sig.extra.offset,
						sig.extra.offset + sig.extra.magic.length
					);
					if (!extraSlice.equals(sig.extra.magic)) continue;
				}
				return true;
			}
		}
		return false;
	} catch {
		return false;
	} finally {
		await fd?.close();
	}
}
```

**Modify findFilesRecursive (lines 365-374):**

```typescript
} else if (entry.isFile()) {
    // Filter by extension if specified
    if (extensions && extensions.length > 0) {
        const ext = extname(entry.name).toLowerCase();
        if (!extensions.includes(ext)) {
            // Fallback: check magic numbers for extensionless files
            if (ext === '' && (await isVideoFileByMagic(fullPath))) {
                files.push(fullPath);
            }
            continue;
        }
    }
    files.push(fullPath);
}
```

---

## Phase 4: Data Cleanup

### SQL Commands

```sql
-- Remove the 67+ stalled "101 Dalmatians" torrents (no seeders)
DELETE FROM download_queue WHERE status = 'stalled' AND title LIKE '%101 Dalmatians%';

-- Remove items with permanent import failures
DELETE FROM download_queue WHERE error_message LIKE '%Import failed after%';

-- Remove the game repack (Surf's Up PC)
DELETE FROM download_queue WHERE title LIKE '%PC%RePack%';

-- Remove the fake/empty Avatar torrent
DELETE FROM download_queue WHERE download_id = 'fb0576296017935e32f0336628f6d3a65903fc42';
```

### qBittorrent Cleanup

Remove corresponding torrents from qBittorrent for cleaned up items:

```bash
# Login
curl -s -c /tmp/qb_cookie.txt "http://192.168.3.192:8080/api/v2/auth/login" -d "username=Tisch22&password=QBittorrent4850!"

# Delete specific torrent (Avatar fake)
curl -s -b /tmp/qb_cookie.txt -X POST "http://192.168.3.192:8080/api/v2/torrents/delete" \
  -d "hashes=fb0576296017935e32f0336628f6d3a65903fc42&deleteFiles=true"

# Delete game repack
curl -s -b /tmp/qb_cookie.txt -X POST "http://192.168.3.192:8080/api/v2/torrents/delete" \
  -d "hashes=dfb3cbb5fcbca2de7d56171ffa5b0dba74d7de38&deleteFiles=true"
```

---

## Verification Steps

After implementation:

1. **Test P0:** Mark an item as failed, wait for poll cycle, verify status stays `failed`
2. **Test P9:** Check that Avatar/Surf's Up items now show correct status (not `downloading`)
3. **Test filters:** Search for a movie and verify OST/game results are rejected
4. **Test magic detection:** Create a test file without extension and verify it's detected
5. **Verify cleanup:** Run `SELECT status, COUNT(*) FROM download_queue GROUP BY status`

---

## Files Modified

1. `src/lib/server/downloadClients/monitoring/DownloadMonitorService.ts` - P0, P9
2. `src/lib/server/scoring/formats/banned.ts` - P3, P6, P7
3. `src/lib/server/downloadClients/import/FileTransfer.ts` - P2
4. `data/cinephage.db` - Cleanup
