import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { customFormats } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { ALL_FORMATS } from '$lib/server/scoring';
import { logger } from '$lib/logging';

/**
 * Condition schema - supports all condition types
 */
const conditionSchema = z.object({
	name: z.string().min(1).max(100),
	type: z.enum([
		'resolution',
		'source',
		'release_title',
		'release_group',
		'codec',
		'audio',
		'hdr',
		'streaming_service',
		'flag'
	]),
	required: z.boolean(),
	negate: z.boolean(),
	// Type-specific fields
	resolution: z.string().optional(),
	source: z.string().optional(),
	pattern: z.string().optional(),
	codec: z.string().optional(),
	audio: z.string().optional(),
	hdr: z.string().nullable().optional(),
	streamingService: z.string().optional(),
	flag: z.enum(['isRemux', 'isRepack', 'isProper', 'is3d']).optional()
});

/**
 * Schema for creating/updating custom formats
 *
 * Note: Formats no longer have defaultScore. Scores are defined per-profile
 * in the profile's formatScores mapping.
 */
const customFormatSchema = z.object({
	id: z.string().min(1).max(50).optional(),
	name: z.string().min(1).max(100),
	description: z.string().max(500).optional(),
	category: z.enum([
		'resolution',
		'release_group_tier',
		'audio',
		'hdr',
		'streaming',
		'micro',
		'low_quality',
		'banned',
		'enhancement',
		'codec',
		'other'
	]),
	tags: z.array(z.string()).optional().default([]),
	conditions: z.array(conditionSchema).min(1),
	enabled: z.boolean().optional().default(true)
});

// Get built-in format IDs for protection
const BUILT_IN_IDS = new Set(ALL_FORMATS.map((f) => f.id));

/**
 * GET /api/custom-formats
 * Returns all formats (built-in + custom)
 */
export const GET: RequestHandler = async ({ url }) => {
	const type = url.searchParams.get('type'); // 'all', 'builtin', 'custom'
	const category = url.searchParams.get('category');
	const search = url.searchParams.get('search');

	// Get custom formats from database
	const dbFormats = await db.select().from(customFormats);

	// Map database formats
	const customFormatsList = dbFormats.map((f) => ({
		id: f.id,
		name: f.name,
		description: f.description ?? undefined,
		category: f.category,
		tags: f.tags ?? [],
		conditions: f.conditions ?? [],
		enabled: f.enabled ?? true,
		isBuiltIn: false,
		createdAt: f.createdAt,
		updatedAt: f.updatedAt
	}));

	// Map built-in formats
	const builtInList = ALL_FORMATS.map((f) => ({
		id: f.id,
		name: f.name,
		description: f.description,
		category: f.category,
		tags: f.tags,
		conditions: f.conditions,
		enabled: true,
		isBuiltIn: true
	}));

	// Combine
	let allFormats = [...builtInList, ...customFormatsList];

	// Apply filters
	if (type === 'builtin') {
		allFormats = allFormats.filter((f) => f.isBuiltIn);
	} else if (type === 'custom') {
		allFormats = allFormats.filter((f) => !f.isBuiltIn);
	}

	if (category) {
		allFormats = allFormats.filter((f) => f.category === category);
	}

	if (search) {
		const query = search.toLowerCase();
		allFormats = allFormats.filter(
			(f) =>
				f.name.toLowerCase().includes(query) ||
				f.description?.toLowerCase().includes(query) ||
				f.tags.some((t) => t.toLowerCase().includes(query))
		);
	}

	return json({
		formats: allFormats,
		count: allFormats.length,
		builtInCount: allFormats.filter((f) => f.isBuiltIn).length,
		customCount: allFormats.filter((f) => !f.isBuiltIn).length
	});
};

/**
 * POST /api/custom-formats
 * Create a new custom format
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const validation = customFormatSchema.safeParse(body);

		if (!validation.success) {
			return json(
				{ error: 'Invalid request body', details: validation.error.issues },
				{ status: 400 }
			);
		}

		const data = validation.data;

		// Check if ID conflicts with built-in
		if (data.id && BUILT_IN_IDS.has(data.id)) {
			return json({ error: `Cannot use reserved format ID '${data.id}'` }, { status: 400 });
		}

		// Check if ID already exists in DB
		if (data.id) {
			const existing = await db.select().from(customFormats).where(eq(customFormats.id, data.id));

			if (existing.length > 0) {
				return json({ error: `Format with ID '${data.id}' already exists` }, { status: 409 });
			}
		}

		// Insert the new format
		const newFormat = await db
			.insert(customFormats)
			.values({
				id: data.id,
				name: data.name,
				description: data.description,
				category: data.category,
				tags: data.tags,
				conditions: data.conditions,
				enabled: data.enabled
			})
			.returning();

		return json(newFormat[0], { status: 201 });
	} catch (error) {
		logger.error('Error creating custom format', error instanceof Error ? error : undefined);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

/**
 * PUT /api/custom-formats
 * Update an existing custom format
 */
export const PUT: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { id, ...updateData } = body;

		if (!id) {
			return json({ error: 'Format ID is required' }, { status: 400 });
		}

		// Cannot update built-in formats
		if (BUILT_IN_IDS.has(id)) {
			return json({ error: 'Cannot modify built-in formats' }, { status: 400 });
		}

		const validation = customFormatSchema.safeParse(updateData);
		if (!validation.success) {
			return json(
				{ error: 'Invalid request body', details: validation.error.issues },
				{ status: 400 }
			);
		}

		const data = validation.data;

		// Check if format exists
		const existing = await db.select().from(customFormats).where(eq(customFormats.id, id));

		if (existing.length === 0) {
			return json({ error: 'Format not found' }, { status: 404 });
		}

		// Update the format
		const updated = await db
			.update(customFormats)
			.set({
				name: data.name,
				description: data.description,
				category: data.category,
				tags: data.tags,
				conditions: data.conditions,
				enabled: data.enabled,
				updatedAt: new Date().toISOString()
			})
			.where(eq(customFormats.id, id))
			.returning();

		return json(updated[0]);
	} catch (error) {
		logger.error('Error updating custom format', error instanceof Error ? error : undefined);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

/**
 * DELETE /api/custom-formats
 * Delete a custom format
 */
export const DELETE: RequestHandler = async ({ request }) => {
	try {
		const { id } = await request.json();

		if (!id) {
			return json({ error: 'Format ID is required' }, { status: 400 });
		}

		// Cannot delete built-in formats
		if (BUILT_IN_IDS.has(id)) {
			return json({ error: 'Cannot delete built-in formats' }, { status: 400 });
		}

		// Delete the format
		const deleted = await db.delete(customFormats).where(eq(customFormats.id, id)).returning();

		if (deleted.length === 0) {
			return json({ error: 'Format not found' }, { status: 404 });
		}

		return json({ success: true, deleted: deleted[0] });
	} catch (error) {
		logger.error('Error deleting custom format', error instanceof Error ? error : undefined);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
