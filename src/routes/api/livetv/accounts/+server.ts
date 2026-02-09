/**
 * Live TV Accounts API
 *
 * GET  /api/livetv/accounts - List all Live TV accounts
 * POST /api/livetv/accounts - Create a new Live TV account
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getLiveTvAccountManager } from '$lib/server/livetv/LiveTvAccountManager';
import { logger } from '$lib/logging';
import { z } from 'zod';
import { ValidationError } from '$lib/errors';

// Validation schema for creating Live TV accounts (supports all provider types)
const liveTvAccountCreateSchema = z.object({
	name: z.string().min(1).max(100),
	providerType: z.enum(['stalker', 'xstream', 'm3u', 'iptvorg']),
	enabled: z.boolean().optional(),
	// Stalker-specific config
	stalkerConfig: z
		.object({
			portalUrl: z.string().url(),
			macAddress: z.string().min(1),
			serialNumber: z.string().optional(),
			deviceId: z.string().optional(),
			deviceId2: z.string().optional(),
			model: z.string().optional(),
			timezone: z.string().optional(),
			username: z.string().optional(),
			password: z.string().optional()
		})
		.optional(),
	// XStream-specific config
	xstreamConfig: z
		.object({
			baseUrl: z.string().url(),
			username: z.string().min(1),
			password: z.string().min(1)
		})
		.optional(),
	// M3U-specific config
	m3uConfig: z
		.object({
			url: z.string().url().optional(),
			fileContent: z.string().optional(),
			epgUrl: z.string().url().optional(),
			refreshIntervalHours: z.number().min(1).max(168).optional(),
			autoRefresh: z.boolean().optional()
		})
		.optional(),
	// IPTV-Org-specific config
	iptvOrgConfig: z
		.object({
			countries: z.array(z.string()).optional(),
			categories: z.array(z.string()).optional(),
			languages: z.array(z.string()).optional()
		})
		.optional()
});

/**
 * List all Live TV accounts
 */
export const GET: RequestHandler = async () => {
	try {
		const manager = getLiveTvAccountManager();
		const accounts = await manager.getAccounts();

		return json({
			success: true,
			accounts
		});
	} catch (error) {
		logger.error(
			'[API] Failed to list Live TV accounts',
			error instanceof Error ? error : undefined
		);

		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to list accounts'
			},
			{ status: 500 }
		);
	}
};

/**
 * Create a new Live TV account
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();

		// Validate input
		const parsed = liveTvAccountCreateSchema.safeParse(body);
		if (!parsed.success) {
			throw new ValidationError('Validation failed', {
				details: parsed.error.flatten()
			});
		}

		const manager = getLiveTvAccountManager();

		// Check if testFirst is explicitly set to false
		const testFirst = body.testFirst !== false;

		const account = await manager.createAccount(parsed.data, testFirst);

		return json(
			{
				success: true,
				account
			},
			{ status: 201 }
		);
	} catch (error) {
		logger.error(
			'[API] Failed to create Live TV account',
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

		// Connection test failures return specific error
		if (message.includes('Connection test failed')) {
			return json(
				{
					success: false,
					error: message
				},
				{ status: 400 }
			);
		}

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
				error: message || 'Failed to create account'
			},
			{ status: 500 }
		);
	}
};
