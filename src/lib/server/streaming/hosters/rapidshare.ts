/**
 * Rapidshare Hoster
 *
 * Resolves Rapidshare embed URLs to actual HLS streams.
 *
 * Supported domains:
 * - rapidshare.cc
 * - rapidairmax.site
 *
 * Pattern:
 * 1. Convert /e/{id} to /media/{id}
 * 2. Fetch encrypted media data
 * 3. Decrypt via enc-dec.app/api/dec-rapid
 * 4. Extract stream URL from response
 */

import { logger } from '$lib/logging';
import { BaseHoster, type HosterConfig, type HosterExtraction, type HosterSubtitle } from './types';

const streamLog = { logCategory: 'streams' as const };

// ============================================================================
// Response Types
// ============================================================================

interface RapidshareMediaResponse {
	result: string;
	status?: boolean;
}

// ============================================================================
// Hoster Implementation
// ============================================================================

export class RapidshareHoster extends BaseHoster {
	readonly config: HosterConfig = {
		id: 'rapidshare',
		name: 'Rapidshare',
		domains: ['rapidshare.cc', 'rapidairmax.site'],
		embedPathPattern: '/e/',
		mediaPathPattern: '/media/',
		timeout: 15000
	};

	protected async doResolve(embedUrl: string): Promise<HosterExtraction> {
		logger.debug('Rapidshare resolving embed', { embedUrl, ...streamLog });

		// Step 1: Convert embed URL to media URL
		const mediaUrl = this.toMediaUrl(embedUrl);
		logger.debug('Rapidshare media URL', { mediaUrl, ...streamLog });

		// Step 2: Fetch encrypted media data
		const mediaResponse = await this.fetchJson<RapidshareMediaResponse>(mediaUrl);

		if (!mediaResponse.result) {
			logger.debug('Rapidshare no result in response', { ...streamLog });
			return { sources: [] };
		}

		// Step 3: Decrypt via enc-dec.app
		const decrypted = await this.encDec.decryptRapidshare({
			text: mediaResponse.result,
			agent: this.userAgent
		});

		// Step 4: Extract stream URL(s)
		const sources: HosterExtraction['sources'] = [];

		// Check for sources array first
		if (decrypted.sources && decrypted.sources.length > 0) {
			for (const source of decrypted.sources) {
				if (this.isValidStreamUrl(source.file)) {
					sources.push({
						url: source.file,
						quality: source.quality || this.extractQuality(source.file),
						type: source.type === 'mp4' ? 'mp4' : 'hls'
					});
				}
			}
		}

		// Fallback to single stream fields
		const streamUrl = decrypted.stream || decrypted.file || decrypted.url;
		if (this.isValidStreamUrl(streamUrl) && !sources.some((s) => s.url === streamUrl)) {
			sources.push({
				url: streamUrl,
				quality: this.extractQuality(streamUrl),
				type: 'hls'
			});
		}

		// Step 5: Extract subtitle tracks
		let subtitles: HosterSubtitle[] | undefined;
		if (decrypted.tracks && decrypted.tracks.length > 0) {
			subtitles = decrypted.tracks
				.filter((track) => track.kind === 'captions' || !track.kind)
				.map((track) => ({
					url: track.file,
					label: track.label,
					language: this.extractLanguageCode(track.label)
				}));

			if (subtitles.length > 0) {
				logger.debug('Rapidshare extracted subtitles', { count: subtitles.length, ...streamLog });
			} else {
				subtitles = undefined;
			}
		}

		logger.debug('Rapidshare resolved streams', { count: sources.length, ...streamLog });
		return { sources, subtitles };
	}

	/**
	 * Extract language code from label text
	 */
	private extractLanguageCode(label: string): string {
		const lower = label.toLowerCase();
		const langMap: Record<string, string> = {
			english: 'en',
			spanish: 'es',
			french: 'fr',
			german: 'de',
			italian: 'it',
			portuguese: 'pt',
			russian: 'ru',
			japanese: 'ja',
			korean: 'ko',
			chinese: 'zh',
			arabic: 'ar',
			hindi: 'hi',
			dutch: 'nl',
			polish: 'pl',
			turkish: 'tr',
			thai: 'th',
			vietnamese: 'vi',
			indonesian: 'id',
			malay: 'ms'
		};

		for (const [name, code] of Object.entries(langMap)) {
			if (lower.includes(name)) return code;
		}

		return 'und'; // undefined language
	}
}
