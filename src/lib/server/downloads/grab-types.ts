import type {
	GrabDecision,
	GrabTarget,
	ReleaseInfo,
	GrabDecisionOptions
} from '$lib/server/filters/stages/grab/types.js';
import type { ScoringProfile } from '$lib/server/scoring/types.js';

export type { GrabDecision, GrabTarget, ReleaseInfo, GrabDecisionOptions };

export interface GrabRequest {
	release: ReleaseInfo;
	target: GrabTarget;
	options: GrabDecisionOptions & {
		downloadClientId?: number | string;
	};
}

export interface GrabResult {
	success: boolean;
	decision: GrabDecision;
	download?: {
		queueId: string;
		hash?: string;
		clientId: string;
		clientName: string;
		category: string;
		wasDuplicate: boolean;
		isUpgrade: boolean;
	};
	error?: string;
}

export interface ResolvedContext {
	movieId?: string;
	seriesId?: string;
	episodeIds?: string[];
	seasonNumber?: number;
	mediaType: 'movie' | 'tv';
	profile: ScoringProfile;
	rootFolderPath?: string;
	mediaPath?: string;
	seriesPath?: string;
}

export interface HandlerResult {
	success: boolean;
	queueId?: string;
	hash?: string;
	clientId?: string;
	clientName?: string;
	category?: string;
	wasDuplicate?: boolean;
	error?: string;
}
