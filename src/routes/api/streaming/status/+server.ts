/**
 * Streaming Status API Endpoint
 *
 * Returns health and status of the upstream Cinephage backend used for streaming resolution.
 *
 * GET /api/streaming/status - Get backend and cache status
 * POST /api/streaming/status - Clear streaming caches
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearCaches } from '$lib/server/streaming/providers';
import { getStreamCache } from '$lib/server/streaming/cache/StreamCache';
import { getCinephageBackendClient } from '$lib/server/indexers/streaming/CinephageBackendClient';
import { logger } from '$lib/logging';

const streamLog = { logCategory: 'streams' as const };

/**
 * Response structure for streaming status
 */
export interface StreamingStatusResponse {
	success: boolean;
	timestamp: string;
	summary: {
		totalProviders: number;
		enabledProviders: number;
		healthyProviders: number;
		circuitBrokenProviders: number;
	};
	cache: {
		streamCache: {
			size: number;
			maxSize: number;
			hits: number;
			misses: number;
			hitRate: number;
		};
		validationCache: {
			size: number;
			maxSize: number;
			hits: number;
			misses: number;
			hitRate: number;
		};
		negativeCache: {
			size: number;
			maxSize: number;
			hits: number;
			misses: number;
			hitRate: number;
		};
	};
	cinephageApi: {
		configured: boolean;
		healthy: boolean;
		baseUrl: string;
		missing: string[];
	};
}

/**
 * GET /api/streaming/status
 * Returns comprehensive status of all streaming providers
 */
export const GET: RequestHandler = async () => {
	try {
		// Get cache statistics
		const cacheStats = getStreamCache().getStats();

		// Get Cinephage backend status
		const cinephageBackend = getCinephageBackendClient();
		const backendHealth = await cinephageBackend.getHealth();

		const response: StreamingStatusResponse = {
			success: true,
			timestamp: new Date().toISOString(),
			summary: {
				totalProviders: 1,
				enabledProviders: backendHealth.configured ? 1 : 0,
				healthyProviders: backendHealth.healthy ? 1 : 0,
				circuitBrokenProviders: 0
			},
			cache: {
				streamCache: {
					size: cacheStats.streamCache.size,
					maxSize: cacheStats.streamCache.maxSize,
					hits: cacheStats.streamCache.hits,
					misses: cacheStats.streamCache.misses,
					hitRate: Math.round(cacheStats.streamCache.hitRate * 1000) / 1000
				},
				validationCache: {
					size: cacheStats.validationCache.size,
					maxSize: cacheStats.validationCache.maxSize,
					hits: cacheStats.validationCache.hits,
					misses: cacheStats.validationCache.misses,
					hitRate: Math.round(cacheStats.validationCache.hitRate * 1000) / 1000
				},
				negativeCache: {
					size: cacheStats.negativeCache.size,
					maxSize: cacheStats.negativeCache.maxSize,
					hits: cacheStats.negativeCache.hits,
					misses: cacheStats.negativeCache.misses,
					hitRate: Math.round(cacheStats.negativeCache.hitRate * 1000) / 1000
				}
			},
			cinephageApi: {
				configured: backendHealth.configured,
				healthy: backendHealth.healthy,
				baseUrl: backendHealth.baseUrl,
				missing: backendHealth.missing
			}
		};

		return json(response);
	} catch (error) {
		logger.error('Failed to get streaming status', error, streamLog);
		return json({ success: false, error: 'Failed to get streaming status' }, { status: 500 });
	}
};

/**
 * POST /api/streaming/status
 * Perform actions on streaming state
 *
 * Actions:
 * - { action: "reset-all" } - Reset all streaming caches
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { action } = body;

		if (action === 'reset-all') {
			clearCaches();
			logger.info('All streaming caches reset', streamLog);
			return json({
				success: true,
				message: 'All streaming caches reset'
			});
		}

		return json(
			{
				success: false,
				error: 'Invalid action',
				validActions: ['reset-all']
			},
			{ status: 400 }
		);
	} catch (error) {
		logger.error('Failed to process streaming status action', error, streamLog);
		return json({ success: false, error: 'Failed to process action' }, { status: 500 });
	}
};
