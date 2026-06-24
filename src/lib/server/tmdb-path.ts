/**
 * TMDB → CinephageAPI path remapping for the source-aware metadata transport.
 */

const REMAPS: Array<[from: string, to: string]> = [
	['/genre/movie/list', '/api/v1/media/genres/movie'],
	['/genre/tv/list', '/api/v1/media/genres/tv'],
	['/configuration/languages', '/api/v1/media/languages'],
	['/configuration/countries', '/api/v1/media/countries'],
	['/watch/providers/', '/api/v1/media/providers/'],
	['/certification/movie/list', '/api/v1/media/certifications/movie'],
	['/certification/tv/list', '/api/v1/media/certifications/tv'],
	['/tv/episode_group/', '/api/v1/media/episode_group/'],
	['/movie/now_playing', '/api/v1/media/now_playing'],
	['/movie/upcoming', '/api/v1/media/upcoming'],
	['/movie/popular', '/api/v1/media/popular_movie'],
	['/tv/popular', '/api/v1/media/popular_tv'],
	['/tv/on_the_air', '/api/v1/media/on_the_air'],
	['/movie/top_rated', '/api/v1/media/top_rated_movie'],
	['/tv/top_rated', '/api/v1/media/top_rated_tv']
];

const FIND_PREFIX = '/find/';

export function remapToCinephageMedia(tmdbEndpoint: string, appendToResponse?: string): string {
	const path = tmdbEndpoint.startsWith('/') ? tmdbEndpoint : `/${tmdbEndpoint}`;

	if (path.startsWith(FIND_PREFIX)) {
		const queryIndex = path.indexOf('?');
		const rawPath = queryIndex === -1 ? path : path.slice(0, queryIndex);
		const externalId = rawPath.slice(FIND_PREFIX.length);
		const query = new URLSearchParams(queryIndex === -1 ? '' : path.slice(queryIndex + 1));
		query.set('external_id', externalId);
		const externalSource = query.get('external_source');
		if (externalSource) {
			query.delete('external_source');
			query.set('source', externalSource);
		}
		return `/api/v1/media/find?${query.toString()}`;
	}

	let remapped = path;
	for (const [from, to] of REMAPS) {
		if (remapped === from || remapped.startsWith(from)) {
			remapped = to + remapped.slice(from.length);
			break;
		}
	}

	if (!remapped.startsWith('/api/v1/media/')) {
		remapped = `/api/v1/media${remapped}`;
	}

	if (appendToResponse) {
		const value = appendToResponse.replace(/watch\/providers/g, 'providers');
		const sep = remapped.includes('?') ? '&' : '?';
		remapped = `${remapped}${sep}expand=${encodeURIComponent(value)}`;
	}

	return remapped;
}
