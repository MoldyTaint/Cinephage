/**
 * Single Lineup Item API
 *
 * GET /api/livetv/lineup/[id] - Get single lineup item
 * PUT /api/livetv/lineup/[id] - Update lineup item
 * DELETE /api/livetv/lineup/[id] - Remove from lineup
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { channelLineupService } from '$lib/server/livetv/lineup';
import { ValidationError } from '$lib/errors';
import { logger } from '$lib/logging';
import type { UpdateChannelRequest } from '$lib/types/livetv';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const item = await channelLineupService.getChannelById(params.id);

		if (!item) {
			return json(
				{
					success: false,
					error: 'Lineup item not found'
				},
				{ status: 404 }
			);
		}

		return json({
			success: true,
			item
		});
	} catch (error) {
		logger.error('[API] Failed to get lineup item', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to get lineup item'
			},
			{ status: 500 }
		);
	}
};

export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const body = (await request.json()) as UpdateChannelRequest;

		const item = await channelLineupService.updateChannel(params.id, body);

		if (!item) {
			return json(
				{
					success: false,
					error: 'Lineup item not found'
				},
				{ status: 404 }
			);
		}

		return json({
			success: true,
			item
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
		logger.error('[API] Failed to update lineup item', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to update lineup item'
			},
			{ status: 500 }
		);
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const success = await channelLineupService.removeFromLineup(params.id);

		if (!success) {
			return json(
				{
					success: false,
					error: 'Lineup item not found'
				},
				{ status: 404 }
			);
		}

		return json({
			success: true
		});
	} catch (error) {
		logger.error('[API] Failed to remove from lineup', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to remove from lineup'
			},
			{ status: 500 }
		);
	}
};
