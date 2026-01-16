import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { captchaSolverSettingsService } from '$lib/server/captcha';
import { z } from 'zod';
import { logger } from '$lib/logging';

/**
 * Schema for updating captcha solver settings
 */
const captchaSolverSettingsSchema = z.object({
	enabled: z.boolean().optional(),
	timeoutSeconds: z.number().min(10).max(300).optional(),
	cacheTtlSeconds: z.number().min(60).max(86400).optional(),
	headless: z.boolean().optional(),
	proxyUrl: z.string().optional(),
	proxyUsername: z.string().optional(),
	proxyPassword: z.string().optional()
});

/**
 * GET /api/captcha-solver
 * Returns current captcha solver settings
 */
export const GET: RequestHandler = async () => {
	try {
		const config = captchaSolverSettingsService.getConfig();

		return json({
			success: true,
			settings: {
				enabled: config.enabled,
				timeoutSeconds: config.timeoutSeconds,
				cacheTtlSeconds: config.cacheTtlSeconds,
				headless: config.headless,
				proxyUrl: config.proxy?.url || '',
				proxyUsername: config.proxy?.username || '',
				proxyPassword: config.proxy?.password ? '********' : '' // Mask password
			}
		});
	} catch (error) {
		logger.error(
			'[API] Failed to get captcha solver settings',
			error instanceof Error ? error : undefined
		);
		return json(
			{
				success: false,
				error: 'Failed to get captcha solver settings'
			},
			{ status: 500 }
		);
	}
};

/**
 * PUT /api/captcha-solver
 * Update captcha solver settings
 */
export const PUT: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const validation = captchaSolverSettingsSchema.safeParse(body);

		if (!validation.success) {
			return json(
				{
					success: false,
					error: 'Invalid request body',
					details: validation.error.issues
				},
				{ status: 400 }
			);
		}

		const settings = validation.data;

		// Update settings
		const updatedConfig = captchaSolverSettingsService.updateConfig(settings);

		return json({
			success: true,
			message: 'Captcha solver settings updated',
			settings: {
				enabled: updatedConfig.enabled,
				timeoutSeconds: updatedConfig.timeoutSeconds,
				cacheTtlSeconds: updatedConfig.cacheTtlSeconds,
				headless: updatedConfig.headless,
				proxyUrl: updatedConfig.proxy?.url || '',
				proxyUsername: updatedConfig.proxy?.username || '',
				proxyPassword: updatedConfig.proxy?.password ? '********' : ''
			}
		});
	} catch (error) {
		logger.error(
			'[API] Failed to update captcha solver settings',
			error instanceof Error ? error : undefined
		);
		return json(
			{
				success: false,
				error: 'Failed to update captcha solver settings'
			},
			{ status: 500 }
		);
	}
};

/**
 * DELETE /api/captcha-solver
 * Reset captcha solver settings to defaults
 */
export const DELETE: RequestHandler = async () => {
	try {
		const defaultConfig = captchaSolverSettingsService.resetToDefaults();

		return json({
			success: true,
			message: 'Captcha solver settings reset to defaults',
			settings: {
				enabled: defaultConfig.enabled,
				timeoutSeconds: defaultConfig.timeoutSeconds,
				cacheTtlSeconds: defaultConfig.cacheTtlSeconds,
				headless: defaultConfig.headless,
				proxyUrl: '',
				proxyUsername: '',
				proxyPassword: ''
			}
		});
	} catch (error) {
		logger.error(
			'[API] Failed to reset captcha solver settings',
			error instanceof Error ? error : undefined
		);
		return json(
			{
				success: false,
				error: 'Failed to reset captcha solver settings'
			},
			{ status: 500 }
		);
	}
};
