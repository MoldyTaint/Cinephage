/**
 * Library Module
 *
 * Re-exports all library services for easy importing.
 */

export { mediaInfoService, MediaInfoService, isVideoFile } from './media-info.js';
export {
	diskScanService,
	DiskScanService,
	type ScanProgress,
	type ScanResult,
	type DiscoveredFile
} from './disk-scan.js';
export { mediaMatcherService, MediaMatcherService, type MatchResult } from './media-matcher.js';
export { libraryWatcherService, LibraryWatcherService } from './library-watcher.js';
export {
	librarySchedulerService,
	LibrarySchedulerService,
	getLibraryScheduler,
	resetLibraryScheduler
} from './library-scheduler.js';
export {
	validateRootFolder,
	getEffectiveScoringProfileId,
	getLanguageProfileId,
	fetchMovieDetails,
	fetchMovieExternalIds,
	fetchSeriesDetails,
	fetchSeriesExternalIds,
	triggerMovieSearch,
	triggerSeriesSearch
} from './LibraryAddService.js';
export { unmatchedFileService, UnmatchedFileService } from './unmatched-file-service.js';
