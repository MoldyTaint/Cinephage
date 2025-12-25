/**
 * Mapple Provider
 *
 * Session-based provider with multiple sources.
 *
 * Pattern: Get session → POST with session → Parse response
 */

import { logger } from '$lib/logging';
import { BaseProvider } from './base';
import type { ProviderConfig, SearchParams, StreamResult } from './types';

const streamLog = { logCategory: 'streams' as const };

// ============================================================================
// Configuration
// ============================================================================

interface MappleSource {
	id: string;
	name: string;
}

const MAPPLE_SOURCES: MappleSource[] = [
	{ id: 'mapple', name: 'Mapple 4K' },
	{ id: 'sakura', name: 'Sakura' },
	{ id: 'alfa', name: 'Pinecone' },
	{ id: 'oak', name: 'Oak' },
	{ id: 'wiggles', name: 'Willow' }
];

// ============================================================================
// Response Types
// ============================================================================

interface MappleStreamData {
	url?: string;
	file?: string;
	stream?: string;
	sources?: Array<{
		file: string;
		type?: string;
	}>;
}

// ============================================================================
// Provider Implementation
// ============================================================================

export class MappleProvider extends BaseProvider {
	readonly config: ProviderConfig = {
		id: 'mapple',
		name: 'Mapple',
		priority: 70,
		enabledByDefault: false, // Currently broken
		supportsMovies: true,
		supportsTv: true,
		supportsAnime: false,
		supportsAsianDrama: false,
		requiresProxy: true,
		referer: 'https://mapple.uk/',
		timeout: 15000,
		requirements: {
			imdbId: false,
			title: false,
			year: false
		}
	};

	protected async doExtract(params: SearchParams): Promise<StreamResult[]> {
		// Get session ID and dynamic Next-Action hash
		const { sessionId, nextAction } = await this.encDec.getMappleSession();

		const results: StreamResult[] = [];

		// Try each source
		for (const source of MAPPLE_SOURCES) {
			try {
				const stream = await this.extractFromSource(source, params, sessionId, nextAction);
				if (stream) {
					results.push(stream);
					if (results.length >= 2) break;
				}
			} catch (error) {
				logger.debug('Mapple source failed', {
					source: source.id,
					error: error instanceof Error ? error.message : String(error),
					...streamLog
				});
			}
		}

		return results;
	}

	private async extractFromSource(
		source: MappleSource,
		params: SearchParams,
		sessionId: string,
		nextAction: string
	): Promise<StreamResult | null> {
		// Build payload
		const payload = [
			{
				mediaId: params.tmdbId,
				mediaType: params.type,
				tv_slug: params.type === 'tv' ? `${params.season}-${params.episode}` : '',
				source: source.id,
				sessionId: sessionId
			}
		];

		// Build URL
		let url: string;
		if (params.type === 'movie') {
			url = `https://mapple.uk/watch/movie/${params.tmdbId}`;
		} else {
			url = `https://mapple.uk/watch/tv/${params.tmdbId}/${params.season}-${params.episode}`;
		}

		// POST with special headers using dynamic Next-Action from API
		const response = await this.fetchPost<string>(url, payload, {
			headers: {
				Referer: 'https://mapple.uk/',
				'Next-Action': nextAction
			},
			responseType: 'text'
		});

		// Parse response (format: "0:...\n1:JSON_DATA")
		const lines = response.split('\n');
		const dataLine = lines.find((l) => l.startsWith('1:'));

		if (!dataLine) {
			return null;
		}

		const jsonData = dataLine.substring(2);
		let streamData: MappleStreamData;

		try {
			streamData = JSON.parse(jsonData);
		} catch {
			logger.debug('Failed to parse Mapple response', { response: dataLine, ...streamLog });
			return null;
		}

		// Extract stream URL
		const streamUrl =
			streamData.url || streamData.file || streamData.stream || streamData.sources?.[0]?.file;

		if (!this.isValidStreamUrl(streamUrl)) {
			return null;
		}

		return this.createStreamResult(streamUrl, {
			quality: source.id === 'mapple' ? '4K' : 'Auto',
			title: `Mapple - ${source.name}`,
			server: source.name
		});
	}
}
