/**
 * API endpoints for channel lineup backup links
 * GET /api/livetv/lineup/[id]/backups - Get all backups for a lineup item
 * POST /api/livetv/lineup/[id]/backups - Add a backup link
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { channelLineupService } from '$lib/server/livetv/lineup/ChannelLineupService';
import { logger } from '$lib/logging';
import { ValidationError } from '$lib/errors';
import type { AddBackupLinkRequest } from '$lib/types/livetv';

/**
 * Get all backup links for a lineup item
 */
export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;

	try {
		// Verify lineup item exists
		const item = await channelLineupService.getChannelById(id);
		if (!item) {
			return json(
				{
					success: false,
					error: 'Lineup item not found'
				},
				{ status: 404 }
			);
		}

		const backups = await channelLineupService.getBackups(id);
		return json({
			success: true,
			backups
		});
	} catch (error) {
		logger.error('[API] Failed to get backups', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to get backups'
			},
			{ status: 500 }
		);
	}
};

/**
 * Add a backup link to a lineup item
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const { id } = params;

	try {
		// Verify lineup item exists
		const item = await channelLineupService.getChannelById(id);
		if (!item) {
			return json(
				{
					success: false,
					error: 'Lineup item not found'
				},
				{ status: 404 }
			);
		}

		let body: AddBackupLinkRequest;
		try {
			body = await request.json();
		} catch {
			throw new ValidationError('Invalid JSON body');
		}

		if (!body.accountId || !body.channelId) {
			throw new ValidationError('Missing required fields: accountId, channelId');
		}

		// Service handles all validation including primary channel check
		const result = await channelLineupService.addBackup(id, body.accountId, body.channelId);

		if (!result.backup) {
			return json(
				{
					success: false,
					error: result.error || 'Failed to add backup'
				},
				{ status: 400 }
			);
		}

		return json(
			{
				success: true,
				backup: result.backup
			},
			{ status: 201 }
		);
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
		logger.error('[API] Failed to add backup', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to add backup'
			},
			{ status: 500 }
		);
	}
};
