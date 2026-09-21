/**
 * Subtitle Services - Module exports
 */

export {
	SubtitleProviderManager,
	getSubtitleProviderManager,
	initializeSubtitleProviderManager
} from './SubtitleProviderManager';

export { SubtitleScoringService, getSubtitleScoringService } from './SubtitleScoringService';

export {
	SubtitleSearchService,
	getSubtitleSearchService,
	type SubtitleSearchOptions
} from './SubtitleSearchService';

export { SubtitleDownloadService, getSubtitleDownloadService } from './SubtitleDownloadService';

export {
	LanguageProfileService,
	getLanguageProfileService,
	type LanguageProfile,
	type CreateLanguageProfile,
	type UpdateLanguageProfile
} from './LanguageProfileService';

export {
	LanguageSettingsService,
	getLanguageSettingsService,
	type LanguageSettingsData
} from './LanguageSettingsService';

export {
	SubtitleSyncService,
	getSubtitleSyncService,
	type SyncOptions
} from './SubtitleSyncService';

export {
	searchSubtitlesForNewMedia,
	searchSubtitlesForMediaBatch,
	type ImportSearchResult,
	type BatchSearchResult
} from './SubtitleImportService';

export { SubtitleScannerService, getSubtitleScannerService } from './SubtitleScannerService';
