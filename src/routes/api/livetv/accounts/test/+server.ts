/**
 * Test Live TV Account Configuration API
 *
 * POST /api/livetv/accounts/test - Test a new account configuration (without saving)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProvider } from '$lib/server/livetv/providers';
import { logger } from '$lib/logging';
import { z } from 'zod';
import { ValidationError } from '$lib/errors';
import type { LiveTvAccount } from '$lib/types/livetv';

// Validation schema for testing Live TV accounts
const liveTvAccountTestSchema = z.object({
	providerType: z.enum(['stalker', 'xstream', 'm3u', 'iptvorg']),
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
			epgUrl: z.string().url().optional()
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
 * Test a Live TV account configuration without saving
 * Useful for validating credentials before creating an account
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();

		// Validate input
		const parsed = liveTvAccountTestSchema.safeParse(body);
		if (!parsed.success) {
			throw new ValidationError('Validation failed', {
				details: parsed.error.flatten()
			});
		}

		// Build temporary account for testing
		const tempAccount: LiveTvAccount = {
			id: 'test',
			name: 'Test Account',
			providerType: parsed.data.providerType,
			enabled: true,
			stalkerConfig: parsed.data.stalkerConfig,
			xstreamConfig: parsed.data.xstreamConfig,
			m3uConfig: parsed.data.m3uConfig,
			playbackLimit: null,
			channelCount: null,
			categoryCount: null,
			expiresAt: null,
			serverTimezone: null,
			lastTestedAt: null,
			lastTestSuccess: null,
			lastTestError: null,
			lastSyncAt: null,
			lastSyncError: null,
			syncStatus: 'never',
			lastEpgSyncAt: null,
			lastEpgSyncError: null,
			epgProgramCount: 0,
			hasEpg: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};

		// Get provider and test
		const provider = getProvider(parsed.data.providerType);
		const result = await provider.testConnection(tempAccount);

		return json({
			success: true,
			result
		});
	} catch (error) {
		logger.error(
			'[API] Failed to test Live TV account configuration',
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

		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to test account configuration'
			},
			{ status: 500 }
		);
	}
};
