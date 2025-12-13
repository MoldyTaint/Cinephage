/**
 * SubtitleSearchWorker
 * Tracks a subtitle search operation for movies or series.
 * Runs the search in the background with progress tracking.
 */

import { TaskWorker } from './TaskWorker.js';
import type { WorkerType, SubtitleSearchWorkerMetadata } from './types.js';
import { searchSubtitlesForNewMedia } from '$lib/server/subtitles/services/SubtitleImportService.js';

/**
 * Options for creating a SubtitleSearchWorker.
 */
export interface SubtitleSearchWorkerOptions {
	mediaType: 'movie' | 'series';
	mediaId: string;
	title: string;
	languageProfileId: string;
}

/**
 * SubtitleSearchWorker runs a subtitle search operation in the background.
 * Uses the SubtitleImportService for the actual search.
 */
export class SubtitleSearchWorker extends TaskWorker<SubtitleSearchWorkerMetadata> {
	readonly type: WorkerType = 'subtitle-search';

	constructor(options: SubtitleSearchWorkerOptions) {
		super({
			mediaType: options.mediaType,
			mediaId: options.mediaId,
			title: options.title,
			languageProfileId: options.languageProfileId,
			subtitlesDownloaded: 0,
			errors: []
		});
	}

	/**
	 * Execute the subtitle search operation.
	 */
	protected async execute(): Promise<void> {
		this.log(
			'info',
			`Starting subtitle search for ${this._metadata.mediaType}: ${this._metadata.title}`
		);

		try {
			if (this._metadata.mediaType === 'movie') {
				const result = await searchSubtitlesForNewMedia('movie', this._metadata.mediaId);

				this.updateMetadata({
					subtitlesDownloaded: result.downloaded,
					errors: result.errors
				});

				this.log('info', `Subtitle search completed for movie`, {
					downloaded: result.downloaded,
					errors: result.errors.length
				});
			} else {
				// For series, we process it as a whole - episodes are searched individually
				// Note: Series subtitle search happens per-episode when files arrive,
				// but we can trigger a full series search here
				const result = await searchSubtitlesForNewMedia('episode', this._metadata.mediaId);

				this.updateMetadata({
					subtitlesDownloaded: result.downloaded,
					errors: result.errors
				});

				this.log('info', `Subtitle search completed for series`, {
					downloaded: result.downloaded,
					errors: result.errors.length
				});
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			this.log('error', `Subtitle search failed: ${message}`);
			throw error;
		}
	}

	/**
	 * Get a summary of the subtitle search operation.
	 */
	getSummary(): {
		mediaType: 'movie' | 'series';
		mediaId: string;
		title: string;
		subtitlesDownloaded: number;
		errors: string[];
		duration: number;
	} {
		const duration = this._startedAt
			? (this._completedAt || new Date()).getTime() - this._startedAt.getTime()
			: 0;

		return {
			mediaType: this._metadata.mediaType,
			mediaId: this._metadata.mediaId,
			title: this._metadata.title,
			subtitlesDownloaded: this._metadata.subtitlesDownloaded,
			errors: this._metadata.errors,
			duration
		};
	}
}
