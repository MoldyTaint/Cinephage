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
import { getCinephageApiService, getPlaybackSessionStore } from '$lib/server/streaming';
import { logger } from '$lib/logging';

const streamLog = { logDomain: 'streams' as const };

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
		sessions: {
			active: number;
			resources: number;
			expired: number;
			created: number;
			reused: number;
		};
	};
	cinephageApi: {
		configured: boolean;
		healthy: boolean;
		baseUrl: string;
		missing: string[];
		version?: string;
		commit?: string;
	};
}

/**
 * GET /api/streaming/status
 * Returns comprehensive status of all streaming providers
 */
export const GET: RequestHandler = async () => {
	try {
		const sessionStats = getPlaybackSessionStore().getStats();
		const backendHealth = await getCinephageApiService().getHealth();

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
				sessions: {
					active: sessionStats.activeSessions,
					resources: sessionStats.resources,
					expired: sessionStats.expiredSessions,
					created: sessionStats.createdSessions,
					reused: sessionStats.reusedSessions
				}
			},
			cinephageApi: {
				configured: backendHealth.configured,
				healthy: backendHealth.healthy,
				baseUrl: backendHealth.baseUrl,
				missing: backendHealth.missing,
				version: backendHealth.upstreamVersion ?? backendHealth.version,
				commit: backendHealth.commit
			}
		};

		return json(response);
	} catch (error) {
		logger.error(
			{
				err: error,
				...streamLog
			},
			'Failed to get streaming status'
		);
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
			getPlaybackSessionStore().clear();
			logger.info({ action, ...streamLog }, 'Cleared all playback sessions');
			return json({
				success: true,
				message: 'All playback sessions reset'
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
		logger.error(
			{
				err: error,
				...streamLog
			},
			'Failed to process streaming status action'
		);
		return json({ success: false, error: 'Failed to process action' }, { status: 500 });
	}
};
