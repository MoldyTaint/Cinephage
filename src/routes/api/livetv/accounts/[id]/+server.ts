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
import { getEpgService, getEpgScheduler } from '$lib/server/livetv/epg';
import { getEpgSyncState } from '$lib/server/livetv/epg/EpgSyncState';
import { liveTvEvents } from '$lib/server/livetv/LiveTvEvents';
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
			password: z.string().min(1).optional(),
			epgUrl: z.preprocess(
				(value) => (typeof value === 'string' ? value.trim() : value),
				z.union([z.string().url(), z.literal('')]).optional()
			)
		})
		.optional(),
	// M3U-specific config updates
	m3uConfig: z
		.object({
			url: z.string().url().optional(),
			fileContent: z.string().optional(),
			epgUrl: z.preprocess(
				(value) => (typeof value === 'string' ? value.trim() : value),
				z.union([z.string().url(), z.literal('')]).optional()
			),
			refreshIntervalHours: z.number().min(1).max(168).optional(),
			autoRefresh: z.boolean().optional()
		})
		.optional()
});

function queueAccountEpgSync(accountId: string): void {
	const syncState = getEpgSyncState();
	const epgScheduler = getEpgScheduler();

	if (epgScheduler.getStatus().isSyncing) {
		logger.info(
			{
				accountId
			},
			'[API] Skipping account EPG sync trigger because scheduler sync is already running'
		);
		return;
	}

	if (!syncState.tryStartAccount(accountId)) {
		logger.info(
			{
				accountId
			},
			'[API] Skipping account EPG sync trigger because another EPG sync is already running'
		);
		return;
	}

	setImmediate(async () => {
		try {
			const epgService = getEpgService();
			liveTvEvents.emitEpgSyncStarted(accountId);
			const result = await epgService.syncAccount(accountId, {
				shouldCancel: () => syncState.isCancelRequestedForAccount(accountId)
			});

			if (result.success) {
				liveTvEvents.emitEpgSyncCompleted(accountId);
				logger.info({ accountId }, '[API] Background EPG sync complete after account update');
			} else {
				const errorMessage = result.error ?? 'EPG sync failed';
				liveTvEvents.emitEpgSyncFailed(accountId, errorMessage);
				logger.warn(
					{ accountId, error: errorMessage },
					'[API] Background EPG sync finished with failure after account update'
				);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			liveTvEvents.emitEpgSyncFailed(accountId, message);
			logger.error(
				{
					accountId,
					error: message
				},
				'[API] Background EPG sync failed after account update'
			);
		} finally {
			syncState.finishAccount(accountId);
		}
	});
}

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

		const updates = parsed.data;
		const hasExplicitM3uEpgField =
			typeof body === 'object' &&
			body !== null &&
			'm3uConfig' in body &&
			typeof body.m3uConfig === 'object' &&
			body.m3uConfig !== null &&
			Object.prototype.hasOwnProperty.call(body.m3uConfig, 'epgUrl');
		const requestedM3uEpgUrl =
			hasExplicitM3uEpgField &&
			typeof body.m3uConfig === 'object' &&
			body.m3uConfig !== null &&
			typeof body.m3uConfig.epgUrl === 'string'
				? body.m3uConfig.epgUrl.trim()
				: null;

		const hasExplicitXstreamEpgField =
			typeof body === 'object' &&
			body !== null &&
			'xstreamConfig' in body &&
			typeof body.xstreamConfig === 'object' &&
			body.xstreamConfig !== null &&
			Object.prototype.hasOwnProperty.call(body.xstreamConfig, 'epgUrl');
		const requestedXstreamEpgUrl =
			hasExplicitXstreamEpgField &&
			typeof body.xstreamConfig === 'object' &&
			body.xstreamConfig !== null &&
			typeof body.xstreamConfig.epgUrl === 'string'
				? body.xstreamConfig.epgUrl.trim()
				: null;

		// Empty epgUrl in update payload means "clear existing epgUrl".
		if (hasExplicitM3uEpgField && updates.m3uConfig && updates.m3uConfig.epgUrl === '') {
			updates.m3uConfig.epgUrl = undefined;
		}
		if (
			hasExplicitXstreamEpgField &&
			updates.xstreamConfig &&
			updates.xstreamConfig.epgUrl === ''
		) {
			updates.xstreamConfig.epgUrl = undefined;
		}

		const manager = getLiveTvAccountManager();
		const existingAccount = await manager.getAccount(params.id);
		if (!existingAccount) {
			return json(
				{
					success: false,
					error: 'Account not found'
				},
				{ status: 404 }
			);
		}

		const previousM3uEpgUrl = (existingAccount.m3uConfig?.epgUrl ?? '').trim();
		const shouldTriggerM3uEpgSync =
			hasExplicitM3uEpgField &&
			existingAccount.providerType === 'm3u' &&
			requestedM3uEpgUrl !== null &&
			previousM3uEpgUrl !== requestedM3uEpgUrl;
		const previousXstreamEpgUrl = (existingAccount.xstreamConfig?.epgUrl ?? '').trim();
		const shouldTriggerXstreamEpgSync =
			hasExplicitXstreamEpgField &&
			existingAccount.providerType === 'xstream' &&
			requestedXstreamEpgUrl !== null &&
			previousXstreamEpgUrl !== requestedXstreamEpgUrl;
		const shouldTriggerAccountEpgSync = shouldTriggerM3uEpgSync || shouldTriggerXstreamEpgSync;
		const account = await manager.updateAccount(params.id, updates);

		if (!account) {
			return json(
				{
					success: false,
					error: 'Account not found'
				},
				{ status: 404 }
			);
		}

		if (shouldTriggerAccountEpgSync && account.enabled) {
			queueAccountEpgSync(account.id);
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
