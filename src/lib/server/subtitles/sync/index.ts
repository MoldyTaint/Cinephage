/**
 * Native Subtitle Sync Engine
 *
 * Public API for the alass-inspired subtitle synchronization engine.
 * This module replaces the external alass binary dependency with a
 * native TypeScript implementation.
 *
 * Tests import directly from source files (e.g., `./align-nosplit.js`),
 * not from this barrel. Only public-facing API is exported here.
 */

// High-level API
export { syncSubtitles, quickOffsetSync } from './subtitle-sync.js';

// VAD (for use by SubtitleSyncService and other consumers)
export { extractSpeechSegments } from './vad.js';

// Types needed by external consumers
export type { SyncOptions, SyncResult, TimeDelta, TimeSpan, ProgressHandler } from './types.js';
