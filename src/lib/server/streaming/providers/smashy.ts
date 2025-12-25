/**
 * Smashystream Provider (Vidstack)
 *
 * Based on reference implementation from Inspiration/EncDecEndpoints/tests/src/providers/vidstack.ts
 *
 * Servers:
 * - Type 1: smashystream, videosmashyi
 * - Type 2: videofsh, short2embed, videoophim
 *
 * URL Patterns:
 * - Type 1 Movie: /{server}/{imdbId}?token=...
 * - Type 1 TV: /{server}/{imdbId}/{tmdbId}/{season}/{episode}?token=...
 * - Type 2 Movie: /{server}/{tmdbId}?token=...
 * - Type 2 TV: /{server}/{tmdbId}/{season}/{episode}?token=...
 */

import { logger } from '$lib/logging';
import { BaseProvider } from './base';
import type { ProviderConfig, SearchParams, StreamResult } from './types';
import type { StreamSubtitle } from '../types/stream';

const streamLog = { logCategory: 'streams' as const };

// ============================================================================
// Configuration - matches reference config.ts
// ============================================================================

const SMASHY_API = 'https://api.smashystream.top/api/v1';

const SERVERS = {
	type1: ['smashystream', 'videosmashyi'],
	type2: ['videofsh', 'short2embed', 'videoophim']
};

// ============================================================================
// Response Types
// ============================================================================

interface SmashyType1DecryptedData {
	source?: string;
	cf?: string;
	player?: Record<string, unknown>;
	swarmId?: string;
}

interface SmashyType2Response {
	data: {
		sources: Array<{ file: string; type?: string }>;
		tracks?: string;
	};
	success?: boolean;
}

// ============================================================================
// Provider Implementation
// ============================================================================

export class SmashyProvider extends BaseProvider {
	readonly config: ProviderConfig = {
		id: 'smashy',
		name: 'Smashystream',
		priority: 40,
		enabledByDefault: false, // Disabled: 13s+ average latency causes timeouts
		supportsMovies: true,
		supportsTv: true,
		supportsAnime: false,
		supportsAsianDrama: false,
		requiresProxy: true,
		referer: 'https://smashystream.top/',
		timeout: 15000,
		requirements: {
			imdbId: true, // Falls back to TMDB ID if not provided
			title: false,
			year: false
		}
	};

	protected async doExtract(params: SearchParams): Promise<StreamResult[]> {
		// Get token - matches reference getSession('vidstack')
		const tokenData = await this.encDec.getVidstackToken();
		const { token, user_id } = tokenData;

		const results: StreamResult[] = [];

		// Try Type 1 first, then Type 2 - matches reference logic
		const type1Result = await this.tryType1Servers(params, token, user_id);
		if (type1Result) {
			results.push(type1Result);
		}

		const type2Result = await this.tryType2Servers(params, token, user_id);
		if (type2Result) {
			results.push(type2Result);
		}

		return results;
	}

	/**
	 * Try Type 1 servers (smashystream, videosmashyi)
	 * Matches reference getStreamType1()
	 */
	private async tryType1Servers(
		params: SearchParams,
		token: string,
		user_id: string
	): Promise<StreamResult | null> {
		for (const server of SERVERS.type1) {
			try {
				// Build player URL - matches reference exactly
				let url: string;
				if (params.type === 'movie') {
					// Type 1 Movie: /{server}/{imdbId}?token=...
					const id = params.imdbId ?? params.tmdbId;
					url = `${SMASHY_API}/${server}/${id}?token=${token}&user_id=${user_id}`;
				} else {
					// Type 1 TV: /{server}/{imdbId}/{tmdbId}/{season}/{episode}?token=...
					const imdbId = params.imdbId ?? params.tmdbId;
					url = `${SMASHY_API}/${server}/${imdbId}/${params.tmdbId}/${params.season}/${params.episode}?token=${token}&user_id=${user_id}`;
				}

				const response = await this.fetchGet<{ data: string }>(url);
				if (!response.data) continue;

				// Parse host and id - matches reference: response.data.split('/#')
				const [host, id] = response.data.split('/#');
				if (!host || !id) continue;

				// Get encrypted stream - matches reference
				const streamUrl = `${host}/api/v1/video?id=${id}`;
				const encrypted = await this.fetchGet<string>(streamUrl, { responseType: 'text' });
				if (!encrypted) continue;

				// Decrypt - matches reference: decrypt('vidstack', { text: encrypted, type: '1' })
				const decrypted = await this.encDec.decryptVidstack<SmashyType1DecryptedData>({
					text: encrypted,
					type: '1'
				});

				// Extract stream URL - matches reference extractStreamUrl()
				const extractedUrl = this.extractStreamUrl(decrypted);
				if (!extractedUrl) continue;

				// Type 1 streams need the player host as referer
				const playerReferer = host.endsWith('/') ? host : `${host}/`;

				return {
					url: extractedUrl,
					quality: 'Auto',
					title: `Smashystream - ${server}`,
					streamType: 'hls',
					referer: playerReferer,
					server
				};
			} catch (error) {
				logger.debug('Smashy Type 1 server failed', {
					server,
					error: error instanceof Error ? error.message : String(error),
					...streamLog
				});
				continue;
			}
		}

		return null;
	}

	/**
	 * Try Type 2 servers (videofsh, short2embed, videoophim)
	 * Matches reference getStreamType2()
	 */
	private async tryType2Servers(
		params: SearchParams,
		token: string,
		user_id: string
	): Promise<StreamResult | null> {
		for (const server of SERVERS.type2) {
			try {
				// Build player URL - matches reference exactly
				let url: string;
				if (params.type === 'movie') {
					// Type 2 Movie: /{server}/{tmdbId}?token=...
					url = `${SMASHY_API}/${server}/${params.tmdbId}?token=${token}&user_id=${user_id}`;
				} else {
					// Type 2 TV: /{server}/{tmdbId}/{season}/{episode}?token=...
					url = `${SMASHY_API}/${server}/${params.tmdbId}/${params.season}/${params.episode}?token=${token}&user_id=${user_id}`;
				}

				const response = await this.fetchGet<SmashyType2Response>(url);
				if (!response.data?.sources?.[0]?.file) continue;

				const file = response.data.sources[0].file;

				// Parse tracks/subtitles if available
				const subtitles = this.parseSmashyTracks(response.data.tracks);
				if (subtitles.length > 0) {
					logger.debug('Smashy tracks found', {
						server,
						count: subtitles.length,
						languages: subtitles.map((s) => s.language),
						...streamLog
					});
				}

				// Decrypt - matches reference: decrypt('vidstack', { text: file, type: '2' })
				const decrypted = await this.encDec.decryptVidstack<string>({
					text: file,
					type: '2'
				});

				// Extract stream URL from decrypted string
				const streamUrl = this.extractStreamUrl(decrypted);
				if (!streamUrl) continue;

				return this.createStreamResult(streamUrl, {
					quality: 'Auto',
					title: `Smashystream - ${server}`,
					server,
					subtitles: subtitles.length > 0 ? subtitles : undefined
				});
			} catch (error) {
				logger.debug('Smashy Type 2 server failed', {
					server,
					error: error instanceof Error ? error.message : String(error),
					...streamLog
				});
				continue;
			}
		}

		return null;
	}

	/**
	 * Extract stream URL from various response formats
	 * Matches reference extractStreamUrl() from utils.ts
	 */
	private extractStreamUrl(data: unknown): string | null {
		if (!data) return null;

		// Direct URL string
		if (typeof data === 'string' && data.includes('http')) {
			// Try to extract URL from string
			const urlMatch = data.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/);
			if (urlMatch) return urlMatch[0];
			const mp4Match = data.match(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/);
			if (mp4Match) return mp4Match[0];
			// Return first URL-like string
			const anyUrl = data.match(/https?:\/\/[^\s"'<>]+/);
			if (anyUrl) return anyUrl[0];
		}

		// Object with sources array
		if (typeof data === 'object' && data !== null) {
			const obj = data as Record<string, unknown>;

			if (Array.isArray(obj.sources)) {
				const source = obj.sources[0] as Record<string, unknown> | string;
				if (typeof source === 'string') return source;
				if (source?.file) return source.file as string;
				if (source?.url) return source.url as string;
			}

			// Object with file/url directly
			if (obj.file) return obj.file as string;
			if (obj.url) return obj.url as string;
			if (obj.stream) return obj.stream as string;
			if (obj.source) {
				if (typeof obj.source === 'string') return obj.source;
				const src = obj.source as Record<string, unknown>;
				return (src.file || src.url) as string | null;
			}

			// Try to find any URL in stringified data
			const str = JSON.stringify(data);
			const m3u8Match = str.match(/https?:\/\/[^"']+\.m3u8[^"']*/);
			if (m3u8Match) return m3u8Match[0].replace(/\\u0026/g, '&').replace(/\\/g, '');

			const mp4Match = str.match(/https?:\/\/[^"']+\.mp4[^"']*/);
			if (mp4Match) return mp4Match[0].replace(/\\u0026/g, '&').replace(/\\/g, '');
		}

		return null;
	}

	/**
	 * Parse Smashy tracks string into StreamSubtitle array
	 * Format: "[en]https://example.com/en.vtt, [es]https://example.com/es.vtt"
	 * or just comma-separated URLs without language tags
	 */
	private parseSmashyTracks(tracks?: string): StreamSubtitle[] {
		if (!tracks || typeof tracks !== 'string') return [];

		const results: StreamSubtitle[] = [];
		const items = tracks
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);

		for (const item of items) {
			// Try to match [lang]url format
			const match = item.match(/^\[([^\]]+)\](.+)$/);
			if (match) {
				const lang = match[1].trim().toLowerCase();
				const url = match[2].trim();
				if (url.startsWith('http')) {
					results.push({
						url,
						label: lang.toUpperCase(),
						language: lang
					});
				}
			} else if (item.startsWith('http')) {
				// Plain URL without language tag
				results.push({
					url: item,
					label: 'Unknown',
					language: 'und'
				});
			}
		}

		return results;
	}
}
