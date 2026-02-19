/**
 * Channel Categories API
 *
 * GET /api/livetv/channel-categories - Get all user categories
 * POST /api/livetv/channel-categories - Create a new category
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { channelCategoryService } from '$lib/server/livetv/categories';
import { ValidationError } from '$lib/errors';
import { logger } from '$lib/logging';
import type { ChannelCategoryFormData } from '$lib/types/livetv';

export const GET: RequestHandler = async () => {
	try {
		const categories = await channelCategoryService.getCategories();
		const channelCounts = await channelCategoryService.getCategoryChannelCounts();

		// Enrich categories with channel counts
		const enriched = categories.map((cat) => ({
			...cat,
			channelCount: channelCounts.get(cat.id) || 0
		}));

		return json({
			success: true,
			categories: enriched,
			total: categories.length
		});
	} catch (error) {
		logger.error(
			'[API] Failed to get channel categories',
			error instanceof Error ? error : undefined
		);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to get channel categories'
			},
			{ status: 500 }
		);
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as ChannelCategoryFormData;

		if (!body.name || typeof body.name !== 'string') {
			throw new ValidationError('name is required');
		}

		const category = await channelCategoryService.createCategory({
			name: body.name.trim(),
			color: body.color,
			icon: body.icon
		});

		return json(
			{
				success: true,
				category
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
		logger.error(
			'[API] Failed to create channel category',
			error instanceof Error ? error : undefined
		);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to create channel category'
			},
			{ status: 500 }
		);
	}
};
