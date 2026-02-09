/**
 * EPG Guide API
 *
 * GET /api/livetv/epg/guide - Get programs for time range (guide view)
 *
 * Query parameters:
 * - start: ISO date string (default: now)
 * - end: ISO date string (default: +6 hours)
 * - channelIds: Comma-separated channel IDs (optional, defaults to lineup channels)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEpgService } from '$lib/server/livetv/epg';
import { channelLineupService } from '$lib/server/livetv/lineup';
import { logger } from '$lib/logging';
import { ValidationError } from '$lib/errors';

const DEFAULT_HOURS = 6;

export const GET: RequestHandler = async ({ url }) => {
	try {
		const epgService = getEpgService();

		// Parse query parameters
		const startParam = url.searchParams.get('start');
		const endParam = url.searchParams.get('end');
		const channelIdsParam = url.searchParams.get('channelIds');

		// Default time range: now to +6 hours
		const now = new Date();
		const start = startParam ? new Date(startParam) : now;
		const end = endParam
			? new Date(endParam)
			: new Date(now.getTime() + DEFAULT_HOURS * 60 * 60 * 1000);

		// Validate dates
		if (isNaN(start.getTime()) || isNaN(end.getTime())) {
			throw new ValidationError('Invalid date format');
		}

		if (start >= end) {
			throw new ValidationError('Start must be before end');
		}

		// Get channel IDs (from param or lineup)
		let channelIds: string[];
		if (channelIdsParam) {
			channelIds = channelIdsParam
				.split(',')
				.map((id) => id.trim())
				.filter(Boolean);
		} else {
			const lineupChannelIds = await channelLineupService.getLineupChannelIds();
			channelIds = Array.from(lineupChannelIds);
		}

		if (channelIds.length === 0) {
			return json({
				success: true,
				programs: {},
				timeRange: {
					start: start.toISOString(),
					end: end.toISOString()
				}
			});
		}

		// Get guide data
		const guideMap = epgService.getGuideData(channelIds, start, end);

		// Convert map to object for JSON
		const programs: Record<string, unknown[]> = {};
		for (const [channelId, channelPrograms] of guideMap) {
			programs[channelId] = channelPrograms;
		}

		return json({
			success: true,
			programs,
			timeRange: {
				start: start.toISOString(),
				end: end.toISOString()
			}
		});
	} catch (error) {
		// Validation errors
		if (error instanceof ValidationError) {
			return json(
				{
					success: false,
					error: error.message,
					code: error.code
				},
				{ status: error.statusCode }
			);
		}
		logger.error('[API] Failed to get EPG guide', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to get EPG guide data'
			},
			{ status: 500 }
		);
	}
};
