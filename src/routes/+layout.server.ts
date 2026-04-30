import type { LayoutServerLoad } from './$types';
import { getLibraryEntityService } from '$lib/server/library/LibraryEntityService.js';
import { db } from '$lib/server/db/index.js';
import { settings } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { TMDB } from '$lib/config/constants.js';

async function getDefaultRegion() {
	try {
		const filtersSetting = await db.query.settings.findFirst({
			where: eq(settings.key, 'global_filters')
		});
		if (filtersSetting) {
			const filters = JSON.parse(filtersSetting.value);
			return filters.region || TMDB.DEFAULT_REGION;
		}
	} catch (e) {
		// Fallback to constant
	}
	return TMDB.DEFAULT_REGION;
}

export const load: LayoutServerLoad = async () => {
	try {
		const libraries = await getLibraryEntityService().listLibraries({ includeSystem: true });
		const movieLibraries = libraries
			.filter((library) => library.mediaType === 'movie')
			.map((library) => ({
				id: library.id,
				slug: library.slug,
				name: library.name,
				mediaSubType: library.mediaSubType,
				isDefault: library.isDefault
			}));
		const tvLibraries = libraries
			.filter((library) => library.mediaType === 'tv')
			.map((library) => ({
				id: library.id,
				slug: library.slug,
				name: library.name,
				mediaSubType: library.mediaSubType,
				isDefault: library.isDefault
			}));

		const hasAnimeMovies = movieLibraries.some(
			(library) => (library.mediaSubType ?? 'standard') === 'anime'
		);
		const hasAnimeSeries = tvLibraries.some(
			(library) => (library.mediaSubType ?? 'standard') === 'anime'
		);

		return {
			defaultRegion: await getDefaultRegion(),
			libraryNav: {
				movieLibraries,
				tvLibraries,
				hasAnimeMovies,
				hasAnimeSeries
			}
		};
	} catch {
		return {
			defaultRegion: TMDB.DEFAULT_REGION,
			libraryNav: {
				movieLibraries: [],
				tvLibraries: [],
				hasAnimeMovies: false,
				hasAnimeSeries: false
			}
		};
	}
};
