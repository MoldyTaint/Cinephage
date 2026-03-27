import { db } from '$lib/server/db';
import { settings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const ANIME_ROOT_FOLDER_ENFORCEMENT_KEY = 'enforce_anime_root_folder';

export async function isAnimeRootFolderEnforcementEnabled(): Promise<boolean> {
	const row = await db
		.select({ value: settings.value })
		.from(settings)
		.where(eq(settings.key, ANIME_ROOT_FOLDER_ENFORCEMENT_KEY))
		.get();

	return row?.value === 'true';
}

export async function setAnimeRootFolderEnforcement(enabled: boolean): Promise<void> {
	await db
		.insert(settings)
		.values({
			key: ANIME_ROOT_FOLDER_ENFORCEMENT_KEY,
			value: enabled ? 'true' : 'false'
		})
		.onConflictDoUpdate({
			target: settings.key,
			set: { value: enabled ? 'true' : 'false' }
		});
}
