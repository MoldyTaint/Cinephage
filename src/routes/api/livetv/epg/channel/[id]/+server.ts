/**
 * EPG Channel API
 *
 * GET /api/livetv/epg/channel/[id] - Get programs for a single channel
 *
 * Query parameters:
 * - start: ISO date string (default: now)
 * - end: ISO date string (default: +6 hours)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEpgService } from '$lib/server/livetv/epg';
import { logger } from '$lib/logging';
import { ValidationError } from '$lib/errors';

const DEFAULT_HOURS = 6;

export const GET: RequestHandler = async ({ params, url }) => {
	try {
		const channelId = params.id;

		if (!channelId) {
			throw new ValidationError('Channel ID is required');
		}

		const epgService = getEpgService();

		// Parse query parameters
		const startParam = url.searchParams.get('start');
		const endParam = url.searchParams.get('end');

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

		// Get programs for channel
		const programs = epgService.getChannelPrograms(channelId, start, end);

		return json({
			success: true,
			channelId,
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
		logger.error('[API] Failed to get EPG for channel', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to get EPG data'
			},
			{ status: 500 }
		);
	}
};
