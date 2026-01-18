/**
 * Provider Analytics API
 *
 * GET /api/subtitles/providers/analytics
 * Returns analytics and throttle status for all subtitle providers
 */

import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import {
	getThrottleManager,
	type ProviderAnalytics
} from '$lib/server/subtitles/throttle/ThrottleMap';
import {
	ensureProvidersRegistered,
	providerRegistry
} from '$lib/server/subtitles/providers/registry';

export interface ProviderAnalyticsResponse {
	/** Provider implementation name */
	provider: string;
	/** Analytics data */
	analytics: ProviderAnalytics & {
		/** Average response time in ms */
		averageResponseTimeMs?: number;
		/** Success rate (0-1) */
		successRate?: number;
	};
	/** Throttle status */
	throttle: {
		isThrottled: boolean;
		throttledUntil?: string;
		errorType?: string;
	};
}

export interface AllAnalyticsResponse {
	providers: ProviderAnalyticsResponse[];
	/** Total registered providers */
	totalProviders: number;
	/** Currently throttled providers count */
	throttledCount: number;
	/** Timestamp */
	timestamp: string;
}

/**
 * GET - Get analytics for all providers
 */
export async function GET(): Promise<Response> {
	try {
		// Ensure providers are registered
		await ensureProvidersRegistered();

		const throttleManager = getThrottleManager();
		const allAnalytics = throttleManager.getAllAnalytics();
		const implementations = providerRegistry.getImplementations();

		const providers: ProviderAnalyticsResponse[] = [];
		let throttledCount = 0;

		// Build response for each provider
		for (const impl of implementations) {
			// Get analytics (may be undefined if never used)
			let analytics = allAnalytics.get(impl);
			if (!analytics) {
				analytics = {
					successCount: 0,
					failureCount: 0,
					totalResponseTimeMs: 0,
					requestCount: 0
				};
			}

			// Calculate derived metrics
			const averageResponseTimeMs =
				analytics.requestCount > 0
					? analytics.totalResponseTimeMs / analytics.requestCount
					: undefined;

			const successRate =
				analytics.requestCount > 0 ? analytics.successCount / analytics.requestCount : undefined;

			// Check throttle status
			const throttleStatus = throttleManager.isThrottled(impl);
			if (throttleStatus.throttled) {
				throttledCount++;
			}

			providers.push({
				provider: impl,
				analytics: {
					...analytics,
					averageResponseTimeMs,
					successRate
				},
				throttle: {
					isThrottled: throttleStatus.throttled,
					throttledUntil: throttleStatus.until?.toISOString(),
					errorType: throttleStatus.errorType
				}
			});
		}

		// Sort by request count (most active first)
		providers.sort((a, b) => b.analytics.requestCount - a.analytics.requestCount);

		const response: AllAnalyticsResponse = {
			providers,
			totalProviders: implementations.length,
			throttledCount,
			timestamp: new Date().toISOString()
		};

		return json(response);
	} catch (error) {
		return json(
			{
				error: 'Failed to get provider analytics',
				message: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
}

/**
 * DELETE - Clear throttle for a specific provider
 *
 * Query params:
 * - provider: The provider implementation name to clear throttle for
 */
export async function DELETE({ url }: RequestEvent): Promise<Response> {
	try {
		const providerName = url.searchParams.get('provider');

		if (!providerName) {
			return json({ error: 'Missing provider parameter' }, { status: 400 });
		}

		const throttleManager = getThrottleManager();

		// Check if provider exists
		await ensureProvidersRegistered();
		if (!providerRegistry.has(providerName)) {
			return json({ error: `Unknown provider: ${providerName}` }, { status: 404 });
		}

		// Clear the throttle
		throttleManager.clearThrottle(providerName);

		return json({
			success: true,
			message: `Throttle cleared for ${providerName}`
		});
	} catch (error) {
		return json(
			{
				error: 'Failed to clear throttle',
				message: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
}
