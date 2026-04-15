import type { LayoutServerLoad } from './$types';
import { getLibraryEntityService } from '$lib/server/library/LibraryEntityService.js';

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
			libraryNav: {
				movieLibraries,
				tvLibraries,
				hasAnimeMovies,
				hasAnimeSeries
			}
		};
	} catch {
		return {
			libraryNav: {
				movieLibraries: [],
				tvLibraries: [],
				hasAnimeMovies: false,
				hasAnimeSeries: false
			}
		};
	}
};
