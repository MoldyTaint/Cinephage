import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { namingPresets } from '$lib/server/db/schema';
import {
	BUILT_IN_PRESETS,
	getBuiltInPreset,
	type NamingPreset
} from '$lib/server/library/naming/presets';
import { eq } from 'drizzle-orm';

/**
 * GET /api/naming/presets/[id]
 * Get a specific preset by ID
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const { id } = params;

		// Check built-in presets first
		const builtIn = getBuiltInPreset(id);
		if (builtIn) {
			return json({ preset: builtIn });
		}

		// Check custom presets
		const [customPreset] = await db.select().from(namingPresets).where(eq(namingPresets.id, id));

		if (!customPreset) {
			return json({ error: 'Preset not found' }, { status: 404 });
		}

		return json({
			preset: {
				id: customPreset.id,
				name: customPreset.name,
				description: customPreset.description || '',
				isBuiltIn: false,
				config: customPreset.config as NamingPreset['config']
			}
		});
	} catch (err) {
		console.error('Error fetching naming preset:', err);
		return json({ error: 'Failed to fetch preset' }, { status: 500 });
	}
};

/**
 * PUT /api/naming/presets/[id]
 * Update a custom preset (cannot update built-in presets)
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const { id } = params;

		// Check if it's a built-in preset
		const builtIn = getBuiltInPreset(id);
		if (builtIn) {
			return json({ error: 'Cannot modify built-in presets' }, { status: 400 });
		}

		// Check if custom preset exists
		const [existing] = await db.select().from(namingPresets).where(eq(namingPresets.id, id));

		if (!existing) {
			return json({ error: 'Preset not found' }, { status: 404 });
		}

		const body = await request.json();
		const { name, description, config } = body as {
			name?: string;
			description?: string;
			config?: Record<string, unknown>;
		};

		// Validate name if provided
		if (name !== undefined) {
			if (typeof name !== 'string' || name.trim().length === 0) {
				return json({ error: 'Name cannot be empty' }, { status: 400 });
			}

			// Check if name conflicts with built-in preset
			const builtInConflict = BUILT_IN_PRESETS.find(
				(p) => p.name.toLowerCase() === name.trim().toLowerCase()
			);
			if (builtInConflict) {
				return json({ error: 'Cannot use a built-in preset name' }, { status: 400 });
			}

			// Check if name already exists in other custom presets
			const existingCustom = await db
				.select()
				.from(namingPresets)
				.where(eq(namingPresets.name, name.trim()));

			if (existingCustom.length > 0 && existingCustom[0].id !== id) {
				return json({ error: 'A preset with this name already exists' }, { status: 400 });
			}
		}

		// Update the preset
		const [updated] = await db
			.update(namingPresets)
			.set({
				...(name !== undefined && { name: name.trim() }),
				...(description !== undefined && { description: description?.trim() || null }),
				...(config !== undefined && { config })
			})
			.where(eq(namingPresets.id, id))
			.returning();

		return json({
			preset: {
				id: updated.id,
				name: updated.name,
				description: updated.description || '',
				isBuiltIn: false,
				config: updated.config as NamingPreset['config']
			}
		});
	} catch (err) {
		console.error('Error updating naming preset:', err);
		return json({ error: 'Failed to update preset' }, { status: 500 });
	}
};

/**
 * DELETE /api/naming/presets/[id]
 * Delete a custom preset (cannot delete built-in presets)
 */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const { id } = params;

		// Check if it's a built-in preset
		const builtIn = getBuiltInPreset(id);
		if (builtIn) {
			return json({ error: 'Cannot delete built-in presets' }, { status: 400 });
		}

		// Delete the preset
		const deleted = await db.delete(namingPresets).where(eq(namingPresets.id, id)).returning();

		if (deleted.length === 0) {
			return json({ error: 'Preset not found' }, { status: 404 });
		}

		return json({ success: true });
	} catch (err) {
		console.error('Error deleting naming preset:', err);
		return json({ error: 'Failed to delete preset' }, { status: 500 });
	}
};
