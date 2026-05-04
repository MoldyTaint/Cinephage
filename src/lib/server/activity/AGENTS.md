# Activity Module (src/lib/server/activity/)

Unified pipeline for fetching, transforming, deduplicating, and filtering activity records across queue, history, monitoring, and move task sources.

## STRUCTURE

- **ActivityService.ts**: Main orchestrator, manages the full activity pipeline from raw record fetch to sorted results.
- **types.ts**: Drizzle-inferred record types and `UnifiedActivity` interface definitions.
- **projectors.ts**: Queue activity projection from download client state into `UnifiedActivity` records.
- **MediaResolverService.ts**: Resolution of media titles and metadata with TTL-based caching.
- **ActivityStreamEvents.ts**: EventEmitter for SSE refresh signals and cache invalidation.

## KEY CONCEPTS

### Pipeline
1. Fetch raw records (queue, history, monitoring, move tasks)
2. Transform into `UnifiedActivity`
3. Deduplicate (active queue items suppress history entries)
4. Filter by status, date, and download client
5. Sort by priority and `startedAt`
6. Build summary counts

### Deduplication Engine
When an item exists in both the active queue AND download history, the active queue version takes priority. The engine uses:
- `buildActiveQueueIndex()` — pre-built lookup by `downloadId`, normalized title, `movieId`, `seriesId`
- `isHistoryRepresentedByActiveQueueIndexed()` — O(1) dedup checks
- Multiple fast paths: exact `downloadId`, exact title, same `grabbedAt`, substring fallback

### State Management
- Singleton pattern via `getInstance()` — lazy init, shared across requests
- Activity counts are cached per query signature
- SSE events trigger cache invalidation

## ANTI-PATTERNS

- **NEVER** bypass the deduplication engine when adding new activity sources
- **NEVER** modify transform output format without updating all consumers
- **NEVER** add DB queries inside transform or dedup methods — keep data fetching separate

## TESTING

- Tests use singleton access: `ActivityService.getInstance()`
- Private methods accessed via `as unknown as { method: ... }` casting
- No DB mocking — tests operate on pure transform, filter, and dedupe logic
