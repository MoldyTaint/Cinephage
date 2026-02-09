/**
 * Live TV Account by ID API
 *
 * GET    /api/livetv/accounts/[id] - Get account by ID
 * PUT    /api/livetv/accounts/[id] - Update account
 * DELETE /api/livetv/accounts/[id] - Delete account
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getLiveTvAccountManager } from '$lib/server/livetv/LiveTvAccountManager';
import { logger } from '$lib/logging';
import { z } from 'zod';
import { ValidationError } from '$lib/errors';

// Validation schema for updating Live TV accounts
const liveTvAccountUpdateSchema = z.object({
	name: z.string().min(1).max(100).optional(),
	enabled: z.boolean().optional(),
	// Stalker-specific config updates
	stalkerConfig: z
		.object({
			portalUrl: z.string().url().optional(),
			macAddress: z.string().min(1).optional(),
			serialNumber: z.string().optional(),
			deviceId: z.string().optional(),
			deviceId2: z.string().optional(),
			model: z.string().optional(),
			timezone: z.string().optional(),
			username: z.string().optional(),
			password: z.string().optional()
		})
		.optional(),
	// XStream-specific config updates
	xstreamConfig: z
		.object({
			baseUrl: z.string().url().optional(),
			username: z.string().min(1).optional(),
			password: z.string().min(1).optional()
		})
		.optional(),
	// M3U-specific config updates
	m3uConfig: z
		.object({
			url: z.string().url().optional(),
			fileContent: z.string().optional(),
			refreshIntervalHours: z.number().min(1).max(168).optional(),
			autoRefresh: z.boolean().optional()
		})
		.optional()
});

/**
 * Get a Live TV account by ID
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const manager = getLiveTvAccountManager();
		const account = await manager.getAccount(params.id);

		if (!account) {
			return json(
				{
					success: false,
					error: 'Account not found'
				},
				{ status: 404 }
			);
		}

		return json({
			success: true,
			account
		});
	} catch (error) {
		logger.error('[API] Failed to get Live TV account', error instanceof Error ? error : undefined);

		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to get account'
			},
			{ status: 500 }
		);
	}
};

/**
 * Update a Live TV account
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const body = await request.json();

		// Validate input
		const parsed = liveTvAccountUpdateSchema.safeParse(body);
		if (!parsed.success) {
			throw new ValidationError('Validation failed', {
				details: parsed.error.flatten()
			});
		}

		const manager = getLiveTvAccountManager();
		const account = await manager.updateAccount(params.id, parsed.data);

		if (!account) {
			return json(
				{
					success: false,
					error: 'Account not found'
				},
				{ status: 404 }
			);
		}

		return json({
			success: true,
			account
		});
	} catch (error) {
		logger.error(
			'[API] Failed to update Live TV account',
			error instanceof Error ? error : undefined
		);

		// Validation errors
		if (error instanceof ValidationError) {
			return json(
				{
					success: false,
					error: error.message,
					code: error.code,
					context: error.context
				},
				{ status: error.statusCode }
			);
		}

		const message = error instanceof Error ? error.message : String(error);

		// Unique constraint violation
		if (message.includes('UNIQUE constraint failed')) {
			return json(
				{
					success: false,
					error: 'An account with this configuration already exists'
				},
				{ status: 409 }
			);
		}

		return json(
			{
				success: false,
				error: message || 'Failed to update account'
			},
			{ status: 500 }
		);
	}
};

/**
 * Delete a Live TV account
 */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const manager = getLiveTvAccountManager();
		const deleted = await manager.deleteAccount(params.id);

		if (!deleted) {
			return json(
				{
					success: false,
					error: 'Account not found'
				},
				{ status: 404 }
			);
		}

		return json({
			success: true
		});
	} catch (error) {
		logger.error(
			'[API] Failed to delete Live TV account',
			error instanceof Error ? error : undefined
		);

		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to delete account'
			},
			{ status: 500 }
		);
	}
};
