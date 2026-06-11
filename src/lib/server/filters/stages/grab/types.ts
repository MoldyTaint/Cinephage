import type { ScoringProfile, ScoringResult } from '$lib/server/scoring/types.js';
import type { DecisionAudit } from '../../types.js';

export type UpgradeStatus = 'new' | 'upgrade' | 'sidegrade' | 'downgrade' | 'blocked' | 'rejected';

export type RejectionType =
	| 'blocklisted'
	| 'banned'
	| 'size_rejected'
	| 'protocol_rejected'
	| 'below_minimum'
	| 'duplicate_hash'
	| 'blocked_extension'
	| 'not_upgrade'
	| 'upgrades_disabled';

export interface ReleaseInfo {
	title: string;
	infoHash?: string;
	magnetUrl?: string;
	downloadUrl?: string;
	indexerId?: string;
	indexerName?: string;
	size?: number;
	protocol?: 'torrent' | 'usenet' | 'streaming';
	category?: string;
}

export interface ExistingFile {
	id: string;
	relativePath: string;
	sceneName?: string | null;
	size?: number | null;
	quality?: { resolution?: string; source?: string; codec?: string; hdr?: string } | null;
	releaseGroup?: string | null;
	episodeIds?: string[] | null;
}

export interface MovieTarget {
	type: 'movie';
	movieId: string;
}

export interface EpisodeTarget {
	type: 'episode';
	episodeId: string;
	seriesId: string;
}

export interface SeasonTarget {
	type: 'season';
	seriesId: string;
	seasonNumber: number;
	episodeIds: string[];
}

export interface SeriesTarget {
	type: 'series';
	seriesId: string;
	episodeIds: string[];
}

export type GrabTarget = MovieTarget | EpisodeTarget | SeasonTarget | SeriesTarget;

export interface GrabDecisionOptions {
	force: boolean;
	skipBlocklist: boolean;
	allowSidegrade: boolean;
	isAutomatic: boolean;
}

export interface GrabDecisionContext {
	release: ReleaseInfo;
	target: GrabTarget;
	existingFiles: ExistingFile[];
	profile: ScoringProfile;
	options: GrabDecisionOptions;
	computed: {
		scoringResult?: ScoringResult;
		candidateScore?: number;
		existingScore?: number;
		upgradeStatus?: UpgradeStatus;
		isBanned?: boolean;
		bannedReasons?: string[];
		sizeRejected?: boolean;
		sizeRejectionReason?: string;
		protocolRejected?: boolean;
		protocolRejectionReason?: string;
		meetsMinimum?: boolean;
	};
}

export interface UpgradeStats {
	improved: number;
	unchanged: number;
	downgraded: number;
	newEpisodes: number;
}

export interface GrabDecision {
	accepted: boolean;
	reason: string;
	rejectionType?: RejectionType;
	upgradeStatus: UpgradeStatus;
	scores: { candidate: number; existing?: number; improvement?: number };
	upgradeStats?: UpgradeStats;
	audit: DecisionAudit;
}
