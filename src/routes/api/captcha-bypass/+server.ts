import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { captchaSolverSettingsService, getCaptchaSolver } from '$lib/server/captcha';
import { logger } from '$lib/logging';

const requestSchema = z
	.object({
		url: z.string().url(),
		cmd: z.string().optional().default('request.get'),
		maxTimeout: z.number().int().positive().optional(),
		max_timeout: z.number().int().positive().optional()
	})
	.transform((data) => ({
		url: data.url,
		cmd: data.cmd,
		maxTimeout: data.maxTimeout ?? data.max_timeout ?? 60
	}));

export const POST: RequestHandler = async ({ request }) => {
	let requestUrl: string;
	try {
		const body = await request.json();
		const parsed = requestSchema.safeParse(body);

		if (!parsed.success) {
			return json(
				{
					success: false,
					message: 'Invalid request',
					error: parsed.error.format(),
					data: null,
					timings: {
						startTimestamp: Date.now(),
						endTimestamp: Date.now(),
						durationMs: 0
					},
					version: process.env.npm_package_version ?? 'unknown'
				},
				{ status: 400 }
			);
		}

		const requestData = parsed.data;
		requestUrl = requestData.url.replace(/"/g, '').trim();
		const startTimestamp = Date.now();
		const solver = getCaptchaSolver();
		const solverEnabled = captchaSolverSettingsService.isEnabled();
		const solverAvailable = solver.isAvailable();

		if (!solverEnabled) {
			return json(
				{
					success: false,
					message: 'Captcha bypass is disabled',
					error: 'Captcha bypass is disabled',
					data: null,
					timings: {
						startTimestamp,
						endTimestamp: Date.now(),
						durationMs: Date.now() - startTimestamp
					},
					version: process.env.npm_package_version ?? 'unknown'
				},
				{ status: 403 }
			);
		}

		if (!solverAvailable) {
			return json(
				{
					success: false,
					message: 'Browser not available',
					error: 'Browser not available',
					data: null,
					timings: {
						startTimestamp,
						endTimestamp: Date.now(),
						durationMs: Date.now() - startTimestamp
					},
					version: process.env.npm_package_version ?? 'unknown'
				},
				{ status: 503 }
			);
		}

		const fetchResult = await solver.fetch({
			url: requestUrl,
			timeout: requestData.maxTimeout
		});

		const endTimestamp = Date.now();

		return json({
			success: fetchResult.success,
			message: fetchResult.success ? 'Success' : (fetchResult.error ?? 'Request failed'),
			error: fetchResult.success ? null : (fetchResult.error ?? 'Request failed'),
			data: fetchResult.success
				? {
						url: fetchResult.url,
						status: fetchResult.status,
						cookies: fetchResult.cookies ?? [],
						userAgent: fetchResult.userAgent ?? '',
						headers: fetchResult.headers ?? {},
						response: fetchResult.body
					}
				: null,
			timings: {
				startTimestamp,
				endTimestamp,
				durationMs: endTimestamp - startTimestamp
			},
			version: process.env.npm_package_version ?? 'unknown'
		});
	} catch (error) {
		logger.error('[API] Captcha bypass request failed', error instanceof Error ? error : undefined);
		const startTimestamp = Date.now();
		const endTimestamp = Date.now();
		return json(
			{
				success: false,
				message: error instanceof Error ? error.message : 'Request failed',
				error: error instanceof Error ? error.message : 'Request failed',
				data: null,
				timings: {
					startTimestamp,
					endTimestamp,
					durationMs: endTimestamp - startTimestamp
				},
				version: process.env.npm_package_version ?? 'unknown'
			},
			{ status: 500 }
		);
	}
};
