/**
 * Downloads module - services for handling download resolution and management.
 */

export {
	getDownloadResolutionService,
	resetDownloadResolutionService,
	type ResolveDownloadInput,
	type ResolvedDownload
} from './DownloadResolutionService';

export {
	releaseDecisionService,
	ReleaseDecisionService,
	type ReleaseDecisionResult,
	type DecisionOptions,
	type ReleaseInfo,
	type UpgradeStats,
	type UpgradeStatus
} from './ReleaseDecisionService';

export {
	getCascadingSearchStrategy,
	resetCascadingSearchStrategy,
	CascadingSearchStrategy,
	type EpisodeToSearch,
	type SeriesData,
	type EpisodeSearchResult,
	type SeasonPackGrab,
	type CascadingSearchOptions,
	type CascadingSearchResult
} from './CascadingSearchStrategy';
