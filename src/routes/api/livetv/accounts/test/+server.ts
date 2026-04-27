/**
 * Test Live TV Account Configuration API
 *
 * POST /api/livetv/accounts/test - Test a new account configuration (without saving)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProvider } from '$lib/server/livetv/providers';
import { logger } from '$lib/logging';
import { toFriendlyLiveTvTestError } from '$lib/livetv/errorMessages';
import { z } from 'zod';
import { ValidationError } from '$lib/errors';
import type { LiveTvAccount } from '$lib/types/livetv';

// Validation schema for testing Live TV accounts
const liveTvAccountTestSchema = z.object({
	providerType: z.enum(['stalker', 'xstream', 'm3u', 'cinephage-iptv']),
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
			baseUrl: z.string().url('Please enter a valid server URL'),
			username: z.string().min(1, 'Username is required'),
			password: z.string().min(1, 'Password is required'),
			epgUrl: z.string().url().optional()
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
	// Cinephage IPTV config
	cinephageIptvConfig: z
		.object({
			countries: z.array(z.string()).optional(),
			categories: z.array(z.string()).optional(),
			languages: z.array(z.string()).optional()
		})
		.optional()
});

/**
 * Build a user-friendly validation error message from flattened Zod errors.
 */
function getFriendlyValidationMessage(error: ValidationError): string {
	const details = (error.context?.details ?? null) as {
		formErrors?: string[];
		fieldErrors?: Record<string, string[] | undefined>;
	} | null;

	const formError = details?.formErrors?.find(
		(message) => typeof message === 'string' && message.length > 0
	);
	if (formError) {
		return formError;
	}

	if (details?.fieldErrors) {
		const firstFieldWithError = Object.entries(details.fieldErrors).find(
			([, messages]) => Array.isArray(messages) && messages.length > 0
		);

		if (firstFieldWithError) {
			const [field, messages] = firstFieldWithError;
			const firstMessage = messages?.[0];
			if (firstMessage) {
				const hasSchemaInternals =
					firstMessage.includes('Too small:') ||
					firstMessage.includes('Invalid input:') ||
					firstMessage.includes('expected string');
				if (!hasSchemaInternals) {
					return firstMessage;
				}

				if (field === 'xstreamConfig') {
					return 'Please enter a valid server URL, username, and password.';
				}
				if (field === 'stalkerConfig') {
					return 'Please enter a valid portal URL and MAC address.';
				}
				if (field === 'm3uConfig') {
					return 'Please provide a valid M3U URL or playlist content.';
				}
				const friendlyField = field
					.replace(/([a-z])([A-Z])/g, '$1 $2')
					.replace(/Config$/, ' configuration')
					.toLowerCase();

				return `Please check ${friendlyField}: ${firstMessage}`;
			}
		}
	}

	return 'Please review the account fields and try again.';
}

/**
 * Test a Live TV account configuration without saving
 * Useful for validating credentials before creating an account
 */
export const POST: RequestHandler = async ({ request }) => {
	let providerType: LiveTvAccount['providerType'] | undefined;

	try {
		const body = await request.json();
		providerType =
			typeof body === 'object' && body && 'providerType' in body
				? ((body as { providerType?: LiveTvAccount['providerType'] }).providerType ?? undefined)
				: undefined;

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
			cinephageIptvConfig: parsed.data.cinephageIptvConfig,

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
		const providerResult = await provider.testConnection(tempAccount);
		const result = providerResult.success
			? providerResult
			: {
					...providerResult,
					error: toFriendlyLiveTvTestError(providerResult.error, parsed.data.providerType)
				};

		return json({
			success: true,
			result
		});
	} catch (error) {
		// Validation errors
		if (error instanceof ValidationError) {
			logger.warn(
				{
					code: error.code,
					statusCode: error.statusCode
				},
				'[API] Live TV account test rejected due to invalid input'
			);

			return json(
				{
					success: false,
					error: getFriendlyValidationMessage(error),
					code: error.code,
					context: error.context
				},
				{ status: error.statusCode }
			);
		}

		logger.error(
			'[API] Failed to test Live TV account configuration',
			error instanceof Error ? error : undefined
		);

		return json(
			{
				success: false,
				error: toFriendlyLiveTvTestError(
					error instanceof Error ? error.message : 'Failed to test account configuration',
					providerType
				)
			},
			{ status: 500 }
		);
	}
};
