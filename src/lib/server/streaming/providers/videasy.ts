/**
 * Videasy Provider
 *
 * Supports multiple servers with different languages:
 * - Neon, Sage, Cypher, Yoru (Original - English)
 * - Killjoy (German), Harbor (Italian), Chamber (French)
 * - Gekko (Latin), Kayo (Spanish), Raze/Phoenix/Astra (Portuguese)
 *
 * Pattern: Fetch encrypted → Decrypt via /dec-videasy
 */

import { logger } from '$lib/logging';
import { BaseProvider } from './base';
import { prioritizeServersByLanguage } from './language-utils';
import type { ProviderConfig, SearchParams, ServerConfig, StreamResult } from './types';

const streamLog = { logCategory: 'streams' as const };

// ============================================================================
// Server Configuration
// ============================================================================

const VIDEASY_API_HOSTS = ['api.videasy.net', 'api2.videasy.net'];

const VIDEASY_SERVERS: ServerConfig[] = [
	// Original language servers (Sage first - Neon has issues with some content)
	{ id: '1movies', name: 'Sage', language: 'en' },
	{ id: 'moviebox', name: 'Cypher', language: 'en' },
	{ id: 'myflixerzupcloud', name: 'Neon', language: 'en' },
	{ id: 'cdn', name: 'Yoru', language: 'en', movieOnly: true },
	{ id: 'primewire', name: 'Reyna', language: 'en' },
	{ id: 'onionplay', name: 'Omen', language: 'en' },
	{ id: 'm4uhd', name: 'Breach', language: 'en' },
	{ id: 'hdmovie', name: 'Vyse', language: 'en' },

	// German
	{ id: 'meine', name: 'Killjoy', language: 'de' },

	// Italian
	{ id: 'meine-it', name: 'Harbor', language: 'it' },

	// French (movie only)
	{ id: 'meine-fr', name: 'Chamber', language: 'fr', movieOnly: true },

	// Hindi
	{ id: 'hdmovie-hi', name: 'Fade', language: 'hi' },

	// Latin Spanish
	{ id: 'cuevana-latino', name: 'Gekko', language: 'es-419' },

	// Spanish
	{ id: 'cuevana-spanish', name: 'Kayo', language: 'es' },

	// Portuguese
	{ id: 'superflix', name: 'Raze', language: 'pt-BR' },
	{ id: 'overflix', name: 'Phoenix', language: 'pt-BR' },
	{ id: 'visioncine', name: 'Astra', language: 'pt-BR' }
];

// ============================================================================
// Response Types
// ============================================================================

interface VideasyDecryptedResponse {
	stream?: string;
	file?: string;
	sources?: Array<{
		url?: string;
		file?: string;
		quality?: string;
		type?: string;
	}>;
}

// ============================================================================
// Provider Implementation
// ============================================================================

export class VideasyProvider extends BaseProvider {
	readonly config: ProviderConfig = {
		id: 'videasy',
		name: 'Videasy',
		priority: 10,
		enabledByDefault: true,
		supportsMovies: true,
		supportsTv: true,
		supportsAnime: false,
		supportsAsianDrama: false,
		requiresProxy: true,
		referer: 'https://videasy.net/',
		timeout: 20000,
		requirements: {
			imdbId: false,
			title: true,
			year: true
		}
	};

	protected async doExtract(params: SearchParams): Promise<StreamResult[]> {
		// Filter servers based on content type
		let availableServers = VIDEASY_SERVERS.filter((server) => {
			if (server.movieOnly && params.type === 'tv') return false;
			if (server.tvOnly && params.type === 'movie') return false;
			return true;
		});

		// Prioritize servers by user's language preferences
		if (params.preferredLanguages?.length) {
			availableServers = prioritizeServersByLanguage(availableServers, params.preferredLanguages);
		}

		// Try to get title from params or use a default
		const title = params.title ?? '';
		const year = params.year?.toString() ?? '';

		// Try top 4 servers in parallel for speed, prioritized by language
		const topServers = availableServers.slice(0, 4);

		const extractionPromises = topServers.map(async (server) => {
			try {
				const result = await this.extractFromServer(server, params, title, year);
				if (result) {
					logger.debug('Server extraction succeeded', {
						server: server.id,
						serverName: server.name,
						language: server.language,
						...streamLog
					});
				}
				return result;
			} catch (error) {
				logger.debug('Server extraction failed', {
					server: server.id,
					error: error instanceof Error ? error.message : String(error),
					...streamLog
				});
				return null;
			}
		});

		// Wait for all parallel extractions and filter successful ones
		const results = (await Promise.all(extractionPromises)).filter(
			(r): r is StreamResult => r !== null
		);

		// If we got results, return them (already sorted by language priority)
		if (results.length > 0) {
			logger.debug('Videasy returning streams', {
				order: results.map((r) => r.server),
				...streamLog
			});
			return results;
		}

		// Fallback: try remaining servers sequentially if top 4 failed
		for (const server of availableServers.slice(4)) {
			try {
				const stream = await this.extractFromServer(server, params, title, year);
				if (stream) {
					return [stream];
				}
			} catch (error) {
				logger.debug('Videasy fallback server failed', {
					server: server.id,
					error: error instanceof Error ? error.message : String(error),
					...streamLog
				});
			}
		}

		return [];
	}

	private async extractFromServer(
		server: ServerConfig,
		params: SearchParams,
		title: string,
		year: string
	): Promise<StreamResult | null> {
		// Build API URL
		const apiHost = VIDEASY_API_HOSTS[0];
		let url = `https://${apiHost}/${server.id}/sources-with-title?`;

		const queryParams = new URLSearchParams({
			title: title,
			mediaType: params.type,
			year: year,
			tmdbId: params.tmdbId
		});

		if (params.type === 'tv' && params.season !== undefined && params.episode !== undefined) {
			queryParams.set('seasonId', params.season.toString());
			queryParams.set('episodeId', params.episode.toString());
		}

		url += queryParams.toString();

		// Fetch encrypted response
		const encryptedData = await this.fetchGet<string>(url, { responseType: 'text' });

		if (!encryptedData || encryptedData.length < 10) {
			return null;
		}

		// Decrypt via enc-dec API
		const decrypted = await this.encDec.decryptVideasy<VideasyDecryptedResponse>({
			text: encryptedData,
			id: params.tmdbId
		});

		// Extract stream URL (API returns sources[].url, not sources[].file)
		const streamUrl =
			decrypted.stream ||
			decrypted.file ||
			decrypted.sources?.[0]?.url ||
			decrypted.sources?.[0]?.file;

		if (!this.isValidStreamUrl(streamUrl)) {
			return null;
		}

		return this.createStreamResult(streamUrl, {
			quality: 'Auto',
			title: `Videasy - ${server.name}`,
			server: server.name,
			language: server.language
		});
	}
}
