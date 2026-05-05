import * as m from '$lib/paraglide/messages.js';

export type LibraryBreakdownItem = {
	id: string;
	name: string;
	mediaType: string;
	mediaSubType: string;
	itemCount: number;
	usedBytes: number;
	path?: string | null;
	hasRootFolder?: boolean;
	rootFolderCount?: number;
	rootFolderIds?: string[];
	detachedItemCount?: number;
	defaultMonitored?: boolean;
	defaultSearchOnAdd?: boolean;
	defaultWantsSubtitles?: boolean;
	unmatchedCount?: number;
	needsScan?: boolean;
};

export type RootFolderBreakdownItem = {
	id: string;
	name: string;
	mediaType: string;
	mediaSubType: string;
	itemCount: number;
	usedBytes: number;
	path?: string | null;
	accessible?: boolean;
	readOnly?: boolean;
	freeSpaceBytes?: number | null;
	totalSpaceBytes?: number | null;
	freeSpaceFormatted?: string | null;
	unmatchedCount?: number;
	lastScannedAt?: string | null;
	lastScanStatus?: string | null;
	needsScan?: boolean;
	freeRatio?: number | null;
};

export type StorageSummary = {
	totalUsedBytes: number;
	moviesUsedBytes: number;
	tvUsedBytes: number;
	subtitlesUsedBytes: number;
	movieCount: number;
	seriesCount: number;
	subtitleCount: number;
	libraryBreakdown: LibraryBreakdownItem[];
	rootFolderBreakdown: RootFolderBreakdownItem[];
	health: {
		librariesWithoutRootFolder: number;
		inaccessibleRootFolders: number;
		readOnlyRootFolders: number;
		unmatchedFiles: number;
		rootFoldersNeedingScan: number;
		lastScan: {
			status: string;
			scanType: string;
			startedAt: string | null;
			completedAt: string | null;
			filesScanned: number;
			filesAdded: number;
			filesUpdated: number;
			filesRemoved: number;
			unmatchedFiles: number;
			errorMessage: string | null;
			durationMs: number | null;
		} | null;
	};
};

export type ScanProgress = {
	phase: string;
	rootFolderId?: string;
	rootFolderPath?: string;
	filesFound: number;
	filesProcessed: number;
	filesAdded: number;
	filesUpdated: number;
	filesRemoved: number;
	unmatchedCount: number;
	currentFile?: string;
};

export type ScanSuccess = {
	message: string;
	unmatchedCount: number;
};

export type ServerStatus = {
	serverId: string;
	serverName: string;
	serverType: string;
	itemCount: number;
	lastSyncAt: string | null;
	lastSyncStatus: string | null;
};

export const DISK_SEGMENT_STYLES = {
	cinephage: 'background-color: #0ea5e9;',
	other: 'background-color: #f59e0b;',
	free: 'background-color: #22c55e;'
} as const;

export function formatTimestamp(timestamp: string | null): string {
	if (!timestamp) return m.settings_general_never();
	return new Date(timestamp).toLocaleString();
}

export function formatDuration(durationMs: number | null): string {
	if (!durationMs || durationMs < 1000) return m.settings_general_underOneSecond();
	const totalSeconds = Math.round(durationMs / 1000);
	if (totalSeconds < 60) return `${totalSeconds}s`;
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

export function getStatusBadgeClass(enabled: boolean): string {
	return enabled
		? 'border-success/30 bg-success/10 text-success'
		: 'border-error/30 bg-error/10 text-error';
}

export function formatPercent(value: number | null | undefined): string {
	if (value === null || value === undefined) return 'N/A';
	return `${Math.round(value * 100)}%`;
}

export function getRootFolderTotalBytes(item: RootFolderBreakdownItem): number | null {
	if (item.totalSpaceBytes === null || item.totalSpaceBytes === undefined) return null;
	return item.totalSpaceBytes;
}

export function getUsedRatio(item: RootFolderBreakdownItem): number | null {
	const totalBytes = getRootFolderTotalBytes(item);
	if (!totalBytes || totalBytes <= 0) return null;
	return item.usedBytes / totalBytes;
}

export function getFreeRatio(item: RootFolderBreakdownItem): number | null {
	const totalBytes = getRootFolderTotalBytes(item);
	if (
		!totalBytes ||
		totalBytes <= 0 ||
		item.freeSpaceBytes === null ||
		item.freeSpaceBytes === undefined
	) {
		return null;
	}
	return Number(item.freeSpaceBytes) / totalBytes;
}

export function getNonCinephageUsedBytes(item: RootFolderBreakdownItem): number | null {
	const totalBytes = getRootFolderTotalBytes(item);
	if (!totalBytes || item.freeSpaceBytes === null || item.freeSpaceBytes === undefined) return null;
	return Math.max(0, totalBytes - Number(item.freeSpaceBytes) - item.usedBytes);
}

export function getNonCinephageRatio(item: RootFolderBreakdownItem): number | null {
	const totalBytes = getRootFolderTotalBytes(item);
	const bytes = getNonCinephageUsedBytes(item);
	if (!totalBytes || bytes === null) return null;
	return bytes / totalBytes;
}

export function segmentWidth(ratio: number | null | undefined): string {
	if (ratio === null || ratio === undefined || ratio <= 0) return '0%';
	return `${Math.round(ratio * 100)}%`;
}

export function getRootFolderScanLabel(item: RootFolderBreakdownItem): string {
	if (item.lastScanStatus === 'completed') return m.settings_general_scanned();
	if (item.lastScanStatus === 'failed') return m.settings_general_scanFailed();
	if (item.lastScanStatus === 'running') return m.settings_general_scanning();
	if (item.needsScan) return m.settings_general_needsScan();
	return m.settings_general_pending();
}

export function getRootFolderScanBadgeClass(item: RootFolderBreakdownItem): string {
	if (item.lastScanStatus === 'completed') return 'bg-success/15 text-success';
	if (item.lastScanStatus === 'failed') return 'bg-error/15 text-error';
	if (item.lastScanStatus === 'running') return 'bg-warning/20 text-warning-content';
	if (item.needsScan) return 'bg-warning/20 text-warning-content';
	return 'bg-base-200 text-base-content/70';
}

export function getScanTone(status: string | null | undefined): string {
	if (status === 'completed') return 'bg-success';
	if (status === 'failed') return 'bg-error';
	if (status === 'running') return 'bg-warning animate-pulse';
	return 'bg-base-300';
}

export function getServerTypeIcon(type: string): string {
	return type === 'jellyfin' ? '🟣' : type === 'emby' ? '🟢' : '🟠';
}

export function getSyncStatusColor(status: string | null, lastSyncAt: string | null): string {
	if (status === 'failed') return 'badge-error';
	if (!lastSyncAt) return 'badge-ghost';
	const hoursSinceSync = (Date.now() - new Date(lastSyncAt).getTime()) / (1000 * 60 * 60);
	if (hoursSinceSync > 24) return 'badge-warning';
	return 'badge-success';
}
