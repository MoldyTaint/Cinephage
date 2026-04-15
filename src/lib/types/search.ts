/**
 * Search-related types for frontend
 */

export interface SearchProgressUpdate {
	phase: string;
	message: string;
	percentComplete: number;
	currentItem?: string;
	details?: {
		releaseName?: string;
		releaseType?: string;
		seasons?: number[];
		episodeCount?: number;
		score?: number;
		decision?: string;
		rejectionReason?: string;
		coveragePercent?: number;
	};
}
