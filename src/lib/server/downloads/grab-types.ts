import type {
	GrabDecision,
	GrabTarget,
	ReleaseInfo,
	GrabDecisionOptions
} from '$lib/server/filters/stages/grab/types.js';
import type { ScoringProfile } from '$lib/server/scoring/types.js';
import type { Resolution } from '$lib/server/indexers/parser/types.js';

export type { GrabDecision, GrabTarget, ReleaseInfo, GrabDecisionOptions };

export interface GrabRequest {
	release: ReleaseInfo & {
		guid?: string;
		commentsUrl?: string;
		categories?: number[];
		releaseGroup?: string;
	};
	target: GrabTarget;
	options: GrabDecisionOptions & {
		downloadClientId?: number | string;
		streamUsenet?: boolean;
		acquisitionProtocol?: 'default' | 'torrent' | 'debrid';
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
		addedToQueue: boolean;
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
	/** Per-movie desired qualities (multi-quality mode). Movies only. */
	desiredQualities?: Resolution[];
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
