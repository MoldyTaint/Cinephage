import { describe, expect, it } from 'vitest';
import { remapToCinephageMedia } from './tmdb-path.js';

describe('remapToCinephageMedia', () => {
	it('remaps genre paths', () => {
		expect(remapToCinephageMedia('/genre/movie/list')).toBe('/api/v1/media/genres/movie');
		expect(remapToCinephageMedia('/genre/tv/list')).toBe('/api/v1/media/genres/tv');
	});

	it('remaps configuration paths', () => {
		expect(remapToCinephageMedia('/configuration/languages')).toBe('/api/v1/media/languages');
		expect(remapToCinephageMedia('/configuration/countries')).toBe('/api/v1/media/countries');
	});

	it('remaps watch providers', () => {
		expect(remapToCinephageMedia('/watch/providers/movie')).toBe('/api/v1/media/providers/movie');
	});

	it('remaps feed endpoints', () => {
		expect(remapToCinephageMedia('/movie/now_playing')).toBe('/api/v1/media/now_playing');
		expect(remapToCinephageMedia('/movie/popular')).toBe('/api/v1/media/popular_movie');
		expect(remapToCinephageMedia('/tv/popular')).toBe('/api/v1/media/popular_tv');
		expect(remapToCinephageMedia('/tv/on_the_air')).toBe('/api/v1/media/on_the_air');
		expect(remapToCinephageMedia('/movie/top_rated')).toBe('/api/v1/media/top_rated_movie');
		expect(remapToCinephageMedia('/tv/top_rated')).toBe('/api/v1/media/top_rated_tv');
	});

	it('remaps certifications', () => {
		expect(remapToCinephageMedia('/certification/movie/list')).toBe(
			'/api/v1/media/certifications/movie'
		);
	});

	it('remaps tv episode groups', () => {
		expect(remapToCinephageMedia('/tv/episode_group/abc123')).toBe(
			'/api/v1/media/episode_group/abc123'
		);
	});

	it('prefixes unlisted paths with /api/v1/media', () => {
		expect(remapToCinephageMedia('/movie/123')).toBe('/api/v1/media/movie/123');
		expect(remapToCinephageMedia('/tv/123')).toBe('/api/v1/media/tv/123');
		expect(remapToCinephageMedia('/search/movie')).toBe('/api/v1/media/search/movie');
		expect(remapToCinephageMedia('/discover/movie')).toBe('/api/v1/media/discover/movie');
		expect(remapToCinephageMedia('/trending/all/week')).toBe('/api/v1/media/trending/all/week');
	});

	it('remaps /find/{id} to a find query param', () => {
		expect(remapToCinephageMedia('/find/tt1375666')).toBe(
			'/api/v1/media/find?external_id=tt1375666'
		);
	});

	it('handles find with external_source query param', () => {
		expect(remapToCinephageMedia('/find/tt1375666?external_source=imdb_id')).toBe(
			'/api/v1/media/find?external_id=tt1375666&source=imdb_id'
		);
	});

	it('translates append_to_response to expand and renames watch/providers', () => {
		expect(
			remapToCinephageMedia('/movie/27205', 'credits,videos,watch/providers,recommendations')
		).toBe('/api/v1/media/movie/27205?expand=credits%2Cvideos%2Cproviders%2Crecommendations');
	});
});
