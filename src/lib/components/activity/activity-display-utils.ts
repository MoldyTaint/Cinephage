import type { UnifiedActivity } from '$lib/types/activity';
import { isImportFailedActivity } from '$lib/types/activity';
import { CheckCircle2, XCircle, AlertCircle, Loader2, Upload, Pause, Minus } from 'lucide-svelte';

/**
 * Status → display metadata mapping shared across all activity UI components.
 *
 * Note: `icon` is typed loosely (`typeof CheckCircle2`) because every
 * lucide-svelte icon shares the same component signature.
 */
export const statusConfig: Record<
	string,
	{ label: string; variant: string; icon: typeof CheckCircle2 }
> = {
	imported: { label: 'Imported', variant: 'badge-success', icon: CheckCircle2 },
	streaming: { label: 'Streaming', variant: 'badge-info', icon: CheckCircle2 },
	downloading: { label: 'Downloading', variant: 'badge-info', icon: Loader2 },
	seeding: { label: 'Seeding', variant: 'badge-success', icon: Upload },
	paused: { label: 'Paused', variant: 'badge-warning', icon: Pause },
	failed: { label: 'Failed', variant: 'badge-error', icon: XCircle },
	rejected: { label: 'Rejected', variant: 'badge-warning', icon: AlertCircle },
	removed: { label: 'Removed', variant: 'badge-ghost', icon: XCircle },
	no_results: { label: 'No Results', variant: 'badge-ghost', icon: Minus },
	searching: { label: 'Searching', variant: 'badge-info', icon: Loader2 }
};

/**
 * Return the user-facing label for an activity's status.
 *
 * Handles the special "Import Failed" case for queue items whose download
 * succeeded but whose post-import step failed. When no explicit fallback is
 * provided, the label is looked up from {@link statusConfig}.
 */
export function getStatusLabel(activity: UnifiedActivity, fallbackLabel?: string): string {
	if (activity.status === 'failed' && isImportFailedActivity(activity)) {
		return 'Import Failed';
	}
	return fallbackLabel ?? statusConfig[activity.status]?.label ?? activity.status;
}

/**
 * Human-readable relative timestamp ("3m ago", "2d ago", etc.).
 *
 * Returns `'-'` when `dateStr` is null/undefined so callers don't need to
 * guard against missing values.
 */
export function formatRelativeTime(dateStr: string | null | undefined): string {
	if (!dateStr) return '-';
	const date = new Date(dateStr);
	const now = new Date();
	const diff = now.getTime() - date.getTime();
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);

	if (minutes < 1) return 'Just now';
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days < 7) return `${days}d ago`;
	return date.toLocaleDateString();
}

/**
 * Extract a meaningful resolution badge string from an activity, or `null`
 * when no badge should be shown.
 *
 * Special-cases "Cinephage Library" streaming items that have no explicit
 * resolution by returning `'Auto'`.
 */
export function getResolutionBadge(activity: UnifiedActivity): string | null {
	const rawResolution = activity.quality?.resolution?.trim();
	if (rawResolution && rawResolution.toLowerCase() !== 'unknown') {
		return rawResolution;
	}

	const isCinephageLibraryStream =
		activity.protocol === 'streaming' &&
		(activity.indexerName?.toLowerCase().includes('cinephage library') ?? false);
	if (isCinephageLibraryStream) {
		return 'Auto';
	}

	return null;
}

/**
 * Pick the most informative timestamp to show for an activity row.
 *
 * - Completed / streaming / monitoring-terminal → `completedAt`
 * - Failed → `lastAttemptAt` (most recent retry)
 * - Otherwise → `startedAt`
 */
export function getDisplayTime(activity: UnifiedActivity): string | null {
	if (activity.completedAt && (activity.status === 'imported' || activity.status === 'streaming')) {
		return activity.completedAt;
	}
	if (activity.completedAt && ['removed', 'rejected', 'no_results'].includes(activity.status)) {
		return activity.completedAt;
	}
	if (activity.status === 'failed' && activity.lastAttemptAt) {
		return activity.lastAttemptAt;
	}
	return activity.startedAt;
}

/**
 * Simple HH:MM time formatter for timeline displays.
 */
export function formatTimestamp(dateStr: string): string {
	const date = new Date(dateStr);
	return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
