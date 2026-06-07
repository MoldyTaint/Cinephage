import { db } from '$lib/server/db';
import { settings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createChildLogger } from '$lib/logging';
import {
	globalBlockedVideoExtensionsSchema,
	type GlobalBlockedVideoExtensions
} from '$lib/validation/schemas.js';

const logger = createChildLogger({ module: 'BlockedVideoExtensions' });
const SETTINGS_KEY = 'global_blocked_video_extensions';

let cached: GlobalBlockedVideoExtensions | null = null;

export async function getBlockedVideoExtensions(): Promise<GlobalBlockedVideoExtensions> {
	if (cached) return cached;

	const row = await db.query.settings.findFirst({ where: eq(settings.key, SETTINGS_KEY) });

	if (row?.value) {
		try {
			const parsed = globalBlockedVideoExtensionsSchema.parse(JSON.parse(row.value));
			cached = parsed;
			return parsed;
		} catch {
			logger.warn('Failed to parse global blocked video extensions, using defaults');
		}
	}

	const defaults = globalBlockedVideoExtensionsSchema.parse({});
	cached = defaults;
	return defaults;
}

export async function setBlockedVideoExtensions(
	data: GlobalBlockedVideoExtensions
): Promise<GlobalBlockedVideoExtensions> {
	await db
		.insert(settings)
		.values({ key: SETTINGS_KEY, value: JSON.stringify(data) })
		.onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(data) } });

	cached = data;
	return data;
}

export function invalidateBlockedVideoExtensionsCache(): void {
	cached = null;
}
