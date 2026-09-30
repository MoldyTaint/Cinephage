import type { LayoutServerLoad } from './$types';
import { getLibraryEntityService } from '$lib/server/library/LibraryEntityService.js';
import { tmdb } from '$lib/server/tmdb.js';

export const load: LayoutServerLoad = async ({ locals }) => {
	const defaultRegion = await tmdb.getRegion();

	// Minimal identity for the shell (avatar/name/role) and the profile
	// page; populated by the auth hook for every authenticated request.
	const user = locals.user
		? {
				id: locals.user.id,
				username: locals.user.username ?? null,
				displayUsername: locals.user.displayUsername ?? locals.user.name,
				name: locals.user.name ?? null,
				email: locals.user.email,
				role: locals.user.role ?? 'user',
				createdAt: locals.user.createdAt ?? null
			}
		: null;

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
			defaultRegion,
			user,
			libraryNav: {
				movieLibraries,
				tvLibraries,
				hasAnimeMovies,
				hasAnimeSeries
			}
		};
	} catch {
		return {
			defaultRegion,
			user,
			libraryNav: {
				movieLibraries: [],
				tvLibraries: [],
				hasAnimeMovies: false,
				hasAnimeSeries: false
			}
		};
	}
};
