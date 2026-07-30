export type ScanProgressPayload = {
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

export const layoutState = $state({
	isSidebarExpanded: true,
	mobileSseStatus: null as 'connected' | 'connecting' | 'error' | null,
	// Storage maintenance live state. Owned by
	// /settings/monitoring/status/+layout.svelte; consumed by sub-pages so the
	// state survives navigation between status sub-pages.
	scanInProgress: false,
	scanProgress: null as ScanProgressPayload | null,
	mediaServerSyncing: false,
	lastInsightsUpdate: null as string | null,
	toggleSidebar() {
		this.isSidebarExpanded = !this.isSidebarExpanded;
	},
	setMobileSseStatus(status: 'connected' | 'connecting' | 'error' | null) {
		this.mobileSseStatus = status;
	},
	clearMobileSseStatus() {
		this.mobileSseStatus = null;
	},
	setScanState(inProgress: boolean, progress: ScanProgressPayload | null) {
		this.scanInProgress = inProgress;
		this.scanProgress = inProgress ? progress : null;
	},
	setMediaServerSyncing(syncing: boolean) {
		this.mediaServerSyncing = syncing;
	},
	markInsightsUpdated(timestamp: string) {
		this.lastInsightsUpdate = timestamp;
	}
});

export function deriveMobileSseStatus(connection: {
	isConnected: boolean;
	status: string;
}): 'connected' | 'connecting' | 'error' | null {
	if (connection.isConnected) {
		return 'connected';
	}
	if (connection.status === 'error') {
		return 'error';
	}
	if (connection.status === 'connecting') {
		return 'connecting';
	}
	return null;
}
