/**
 * Tracked Download State Machine
 *
 * Implements Radarr-style state tracking for downloads.
 * This provides more granular control over the download lifecycle
 * than simple status strings.
 *
 * @see https://github.com/Radarr/Radarr/blob/develop/src/NzbDrone.Core/Download/TrackedDownloads/TrackedDownload.cs
 */

/**
 * States for tracked downloads following Radarr's pattern.
 *
 * State transitions:
 * - Downloading → ImportPending (when download completes)
 * - Downloading → FailedPending (when download fails)
 * - ImportPending → Importing (when import starts)
 * - ImportPending → ImportBlocked (when manual intervention needed)
 * - Importing → Imported (when import succeeds)
 * - Importing → ImportPending (when import fails but can retry)
 * - Importing → ImportBlocked (when import fails permanently)
 * - FailedPending → Failed (after processing failed download)
 * - Any → Ignored (when user ignores the download)
 */
export enum TrackedDownloadState {
	/** Download is actively downloading or queued in the client */
	Downloading = 'downloading',

	/** Download completed but import is blocked (manual intervention required) */
	ImportBlocked = 'importBlocked',

	/** Download completed and ready for import */
	ImportPending = 'importPending',

	/** Import is currently in progress */
	Importing = 'importing',

	/** Successfully imported to library */
	Imported = 'imported',

	/** Download failed, pending processing */
	FailedPending = 'failedPending',

	/** Download failed and has been processed */
	Failed = 'failed',

	/** User has chosen to ignore this download */
	Ignored = 'ignored'
}

/**
 * Status indicator for tracked downloads (warning/error states)
 */
export enum TrackedDownloadStatus {
	/** No issues */
	Ok = 'ok',

	/** Warning condition (e.g., stalled, missing files) */
	Warning = 'warning',

	/** Error condition */
	Error = 'error'
}

/**
 * Status message attached to a tracked download
 */
export interface TrackedDownloadStatusMessage {
	title: string;
	messages: string[];
}

/**
 * Tracked download with full state information
 */
export interface TrackedDownload {
	/** Download client ID */
	downloadClientId: string;

	/** Download item from the client */
	downloadId: string;

	/** Info hash (for torrents) */
	infoHash?: string;

	/** Current state in the state machine */
	state: TrackedDownloadState;

	/** Current status (ok/warning/error) */
	status: TrackedDownloadStatus;

	/** Status messages explaining any issues */
	statusMessages: TrackedDownloadStatusMessage[];

	/** Protocol type */
	protocol: 'torrent' | 'usenet';

	/** Indexer name */
	indexer?: string;

	/** When the download was added */
	addedAt?: string;

	/** Whether this download should be tracked */
	isTrackable: boolean;

	/** Whether we've notified about manual interaction requirement */
	hasNotifiedManualInteractionRequired: boolean;

	/** Linked movie ID */
	movieId?: string;

	/** Linked series ID */
	seriesId?: string;

	/** Episode IDs for series downloads */
	episodeIds?: string[];

	/** Download title */
	title: string;

	/** Output path for import */
	outputPath?: string;

	/**
	 * Whether files can be moved (false for seeding torrents).
	 * When false, import should use hardlink/copy to preserve source for seeding.
	 */
	canMoveFiles: boolean;

	/**
	 * Whether the download can be removed from the client.
	 * True when: imported AND (usenet OR torrent paused after meeting seed limits)
	 */
	canBeRemoved: boolean;

	/** Whether this download has been removed from the client */
	removed: boolean;
}

/**
 * Check if a state indicates the download is still actively tracked
 */
export function isTrackableState(state: TrackedDownloadState): boolean {
	return (
		state !== TrackedDownloadState.Imported &&
		state !== TrackedDownloadState.Failed &&
		state !== TrackedDownloadState.Ignored
	);
}

/**
 * Check if a state indicates the download is complete (for import purposes)
 */
export function isCompletedState(state: TrackedDownloadState): boolean {
	return (
		state === TrackedDownloadState.ImportPending ||
		state === TrackedDownloadState.ImportBlocked ||
		state === TrackedDownloadState.Importing ||
		state === TrackedDownloadState.Imported
	);
}

/**
 * Check if a state indicates a failure
 */
export function isFailedState(state: TrackedDownloadState): boolean {
	return state === TrackedDownloadState.Failed || state === TrackedDownloadState.FailedPending;
}

/**
 * Map from QueueStatus to TrackedDownloadState
 * Used during migration from old status-based tracking
 */
export function queueStatusToTrackedState(status: string, progress: number): TrackedDownloadState {
	switch (status) {
		case 'queued':
		case 'downloading':
		case 'stalled':
		case 'paused':
			return TrackedDownloadState.Downloading;

		case 'completed':
		case 'postprocessing':
			return TrackedDownloadState.ImportPending;

		case 'seeding':
			// Seeding with 100% progress means ready for import
			return progress >= 1 ? TrackedDownloadState.ImportPending : TrackedDownloadState.Downloading;

		case 'importing':
			return TrackedDownloadState.Importing;

		case 'imported':
			return TrackedDownloadState.Imported;

		case 'failed':
			return TrackedDownloadState.Failed;

		case 'removed':
			return TrackedDownloadState.Ignored;

		default:
			return TrackedDownloadState.Downloading;
	}
}

/**
 * Map from TrackedDownloadState to QueueStatus for backward compatibility
 */
export function trackedStateToQueueStatus(
	state: TrackedDownloadState,
	downloadStatus?: string
): string {
	switch (state) {
		case TrackedDownloadState.Downloading:
			// Preserve the original download status for more detail
			if (downloadStatus === 'seeding') return 'seeding';
			if (downloadStatus === 'stalled') return 'stalled';
			if (downloadStatus === 'paused') return 'paused';
			if (downloadStatus === 'queued') return 'queued';
			return 'downloading';

		case TrackedDownloadState.ImportPending:
			return downloadStatus === 'seeding' ? 'seeding' : 'completed';

		case TrackedDownloadState.ImportBlocked:
			return 'failed'; // Show as failed since manual intervention needed

		case TrackedDownloadState.Importing:
			return 'importing';

		case TrackedDownloadState.Imported:
			return 'imported';

		case TrackedDownloadState.FailedPending:
		case TrackedDownloadState.Failed:
			return 'failed';

		case TrackedDownloadState.Ignored:
			return 'removed';

		default:
			return 'queued';
	}
}
