/**
 * Megaup Hoster
 *
 * Resolves Megaup embed URLs to actual HLS streams.
 *
 * Supported domains:
 * - megaup.site, megaup.live, megaup*.online (and numbered variants)
 * - 4spromax.site
 *
 * Pattern:
 * 1. Convert /e/{id} to /media/{id}
 * 2. Fetch encrypted media data
 * 3. Decrypt via enc-dec.app/api/dec-mega
 * 4. Extract stream URL from response
 */

import { logger } from '$lib/logging';
import { BaseHoster, type HosterConfig, type HosterExtraction, type HosterSubtitle } from './types';

const streamLog = { logCategory: 'streams' as const };

// ============================================================================
// Response Types
// ============================================================================

interface MegaupMediaResponse {
	result: string;
	status?: boolean;
}

// ============================================================================
// Hoster Implementation
// ============================================================================

export class MegaupHoster extends BaseHoster {
	readonly config: HosterConfig = {
		id: 'megaup',
		name: 'Megaup',
		// Core domains - also matches megaup*.online variants via canHandle override
		domains: ['megaup.site', 'megaup.live', '4spromax.site'],
		embedPathPattern: '/e/',
		mediaPathPattern: '/media/',
		timeout: 15000
	};

	/**
	 * Check if this hoster can handle the given URL
	 * Extends base to support megaup numbered domains (megaup22.online, etc.)
	 */
	canHandle(url: string): boolean {
		// First check exact domain match
		if (super.canHandle(url)) {
			return true;
		}

		// Then check for megaup pattern domains (e.g., megaup22.online)
		try {
			const parsed = new URL(url);
			const domain = parsed.hostname.replace(/^www\./, '');
			// Match megaup followed by optional numbers, then .online or .live
			return /^megaup\d*\.(online|live|site)$/.test(domain);
		} catch {
			return false;
		}
	}

	protected async doResolve(embedUrl: string): Promise<HosterExtraction> {
		logger.debug('Megaup resolving embed', { embedUrl, ...streamLog });

		// Step 1: Convert embed URL to media URL
		const mediaUrl = this.toMediaUrl(embedUrl);
		logger.debug('Megaup media URL', { mediaUrl, ...streamLog });

		// Step 2: Fetch encrypted media data
		const mediaResponse = await this.fetchJson<MegaupMediaResponse>(mediaUrl);

		if (!mediaResponse.result) {
			logger.debug('Megaup no result in response', { ...streamLog });
			return { sources: [] };
		}

		// Step 3: Decrypt via enc-dec.app
		const decrypted = await this.encDec.decryptMegaup({
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
				logger.debug('Megaup extracted subtitles', { count: subtitles.length, ...streamLog });
			} else {
				subtitles = undefined;
			}
		}

		logger.debug('Megaup resolved streams', { count: sources.length, ...streamLog });
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
