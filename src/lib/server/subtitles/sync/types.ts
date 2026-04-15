/**
 * Core Time Types for Subtitle Sync Engine
 *
 * Port of alass-core time_types.rs to TypeScript.
 * All time values are in milliseconds (integer precision).
 *
 * We use plain numbers rather than wrapper classes for performance,
 * since JavaScript doesn't benefit from newtype patterns the way Rust does.
 * Type aliases provide documentation clarity.
 */

/**
 * A time difference in milliseconds.
 * Can be negative (e.g., shift backwards).
 */
export type TimeDelta = number;

/**
 * An absolute time point in milliseconds.
 * Always relative to the start of the media (0 = beginning).
 */
export type TimePoint = number;

/**
 * A time interval from start (inclusive) to end (exclusive).
 * Invariant: start <= end.
 */
export interface TimeSpan {
	/** Start time in milliseconds (inclusive) */
	start: TimePoint;
	/** End time in milliseconds (exclusive) */
	end: TimePoint;
}

/**
 * Create a TimeSpan. Asserts start <= end.
 */
export function createTimeSpan(start: TimePoint, end: TimePoint): TimeSpan {
	if (start > end) {
		throw new Error(`TimeSpan: start (${start}) must be <= end (${end})`);
	}
	return { start, end };
}

/**
 * Create a TimeSpan, swapping start/end if needed (safe constructor).
 */
export function createTimeSpanSafe(a: TimePoint, b: TimePoint): TimeSpan {
	return a <= b ? { start: a, end: b } : { start: b, end: a };
}

/**
 * Length of a TimeSpan in milliseconds.
 */
export function spanLength(span: TimeSpan): TimeDelta {
	return span.end - span.start;
}

/**
 * Whether a span has zero length (start === end).
 */
export function isEmptySpan(span: TimeSpan): boolean {
	return span.end === span.start;
}

/**
 * Shift a TimeSpan by a delta.
 */
export function shiftSpan(span: TimeSpan, delta: TimeDelta): TimeSpan {
	return { start: span.start + delta, end: span.end + delta };
}

/**
 * Scale a TimeSpan by a factor (for FPS conversion).
 */
export function scaleSpan(span: TimeSpan, factor: number): TimeSpan {
	return {
		start: Math.round(span.start * factor),
		end: Math.round(span.end * factor)
	};
}

/**
 * Whether span `outer` fully contains span `inner`.
 */
export function spanContains(outer: TimeSpan, inner: TimeSpan): boolean {
	return inner.start >= outer.start && inner.end <= outer.end;
}

/**
 * Overlapping length between two TimeSpans (0 if no overlap).
 */
export function spanOverlap(a: TimeSpan, b: TimeSpan): TimeDelta {
	const overlapStart = Math.max(a.start, b.start);
	const overlapEnd = Math.min(a.end, b.end);
	return Math.max(0, overlapEnd - overlapStart);
}

/**
 * Distance between two non-overlapping spans (0 if they overlap).
 */
export function spanDistance(a: TimeSpan, b: TimeSpan): TimeDelta {
	if (a.end <= b.start) return b.start - a.end;
	if (b.end <= a.start) return a.start - b.end;
	return 0;
}

/**
 * Score function type for alignment.
 * Takes two span durations (reference, incorrect) and returns a score.
 */
export type ScoreFunction = (refDuration: TimeDelta, inDuration: TimeDelta) => number;

/**
 * Progress handler for long-running alignment operations.
 */
export interface ProgressHandler {
	/** Called once before processing begins. `steps` is the total step count. */
	init?(steps: number): void;
	/** Called on each step of progress. */
	inc?(): void;
	/** Called when processing is complete. */
	finish?(): void;
}

/**
 * No-op progress handler.
 */
export const NO_PROGRESS: ProgressHandler = {};

/**
 * Result of a no-split alignment.
 */
export interface NosplitResult {
	/** The single best constant offset in milliseconds */
	delta: TimeDelta;
	/** Alignment score (higher is better) */
	score: number;
}

/**
 * Result of a split-aware alignment.
 */
export interface SplitResult {
	/** Per-span deltas (one per input span) */
	deltas: TimeDelta[];
	/** Total alignment score */
	score: number;
}

/**
 * Options for the subtitle sync engine.
 */
export interface SyncOptions {
	/** Reference type: 'video' (audio VAD) or 'subtitle' (another subtitle file) */
	referenceType: 'video' | 'subtitle';
	/** Path to reference file (video or subtitle) */
	referencePath: string;
	/** Path to the incorrect subtitle file */
	subtitlePath: string;
	/** Output path for the synced subtitle (defaults to overwriting input) */
	outputPath?: string;
	/**
	 * Split penalty: 0-1000 (default 7).
	 * Higher values discourage introducing splits. Values 5-20 are most useful.
	 */
	splitPenalty?: number;
	/**
	 * When true, only apply a constant offset (no splits). Much faster.
	 */
	noSplits?: boolean;
	/** Progress callback */
	progress?: ProgressHandler;
}

/**
 * Result from the high-level sync operation.
 */
export interface SyncResult {
	/** Whether sync completed successfully */
	success: boolean;
	/** Primary offset in ms (for nosplit, the single delta; for split, the median delta) */
	offsetMs: number;
	/** Per-cue deltas (only populated in split mode) */
	perCueDeltas?: TimeDelta[];
	/** Number of distinct offsets applied (1 for nosplit, potentially more for split) */
	splitCount: number;
	/** Alignment score */
	score: number;
	/** Error message if success is false */
	error?: string;
	/** Time taken for alignment in milliseconds */
	alignmentTimeMs: number;
}
