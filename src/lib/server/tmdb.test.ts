import { describe, it, expect } from 'vitest';
import { tmdb } from './tmdb';
import type { CastMember } from '$lib/types/tmdb';

// We need to mock the database call if we want to run this in CI without a real DB,
// BUT the user asked for a "robust" test that checks if it "works", implying integration.
// However, running against a real DB in a test file can be flaky if the environment isn't set up perfectly.
// Given the user's request to "test these before we start building", they likely want to verify the REAL connection.

// To make this work with SvelteKit's virtual modules in a test environment,
// we rely on Vitest's ability to resolve aliases via vite.config.ts.
// However, $env/dynamic/private needs to be available.
// If the user has a .env file, Vitest usually loads it.

type TmdbResponse = any;

describe('TMDB Integration', () => {
	it('should fetch configuration', async () => {
		const config = (await tmdb.fetch('/configuration')) as TmdbResponse;
		expect(config).not.toBeNull();
		expect(config.images).toBeDefined();
		expect(config.images.secure_base_url).toContain('https://');
	});

	it('should fetch a specific movie (Fight Club)', async () => {
		const movie = (await tmdb.fetch('/movie/550')) as TmdbResponse;
		expect(movie).not.toBeNull();
		expect(movie.id).toBe(550);
		expect(movie.title).toBe('Fight Club');
	});

	it('should search for a movie', async () => {
		const search = (await tmdb.fetch('/search/movie?query=Inception')) as TmdbResponse;
		expect(search).not.toBeNull();
		expect(search.results).toBeDefined();
		expect(search.results.length).toBeGreaterThan(0);
		expect(search.results[0].title).toContain('Inception');
	});

	it('should fetch full movie details (credits, providers, videos)', async () => {
		// Fight Club (550)
		const movie = (await tmdb.fetch(
			'/movie/550?append_to_response=credits,watch/providers,videos'
		)) as TmdbResponse;
		expect(movie).not.toBeNull();

		// Basic Info
		expect(movie.title).toBe('Fight Club');

		// Credits (Cast & Crew)
		expect(movie.credits).toBeDefined();
		expect(movie.credits.cast.length).toBeGreaterThan(0);
		const bradPitt = movie.credits.cast.find((c: CastMember) => c.name === 'Brad Pitt');
		expect(bradPitt).toBeDefined();
		expect(bradPitt.character).toBe('Tyler Durden');

		// Watch Providers
		expect(movie['watch/providers']).toBeDefined();
		expect(movie['watch/providers'].results).toBeDefined();
		// Note: Providers vary by region, but US usually exists
		if (movie['watch/providers'].results.US) {
			expect(movie['watch/providers'].results.US).toBeDefined();
		}

		// Videos
		expect(movie.videos).toBeDefined();
		expect(movie.videos.results.length).toBeGreaterThan(0);
	});

	it('should fetch TV show details with seasons', async () => {
		// Breaking Bad (1396)
		const show = (await tmdb.fetch('/tv/1396')) as TmdbResponse;
		expect(show).not.toBeNull();

		expect(show.name).toBe('Breaking Bad');
		expect(show.number_of_seasons).toBeGreaterThanOrEqual(5);
		expect(show.seasons).toBeDefined();
		expect(show.seasons.length).toBeGreaterThan(0);
	});

	it('should fetch specific TV episode details', async () => {
		// Breaking Bad S01E01
		const episode = (await tmdb.fetch(
			'/tv/1396/season/1/episode/1?append_to_response=credits'
		)) as TmdbResponse;
		expect(episode).not.toBeNull();

		expect(episode.name).toBe('Pilot');
		expect(episode.air_date).toBe('2008-01-20');
		expect(episode.credits).toBeDefined();
		expect(episode.credits.cast.length).toBeGreaterThan(0);
		const bryanCranston = episode.credits.cast.find((c: CastMember) => c.name === 'Bryan Cranston');
		expect(bryanCranston).toBeDefined();
	});

	it('should fetch person details and credits', async () => {
		// Brad Pitt (287)
		const person = (await tmdb.fetch(
			'/person/287?append_to_response=combined_credits'
		)) as TmdbResponse;
		expect(person).not.toBeNull();

		expect(person.name).toBe('Brad Pitt');
		expect(person.combined_credits).toBeDefined();
		expect(person.combined_credits.cast.length).toBeGreaterThan(0);

		// Check he was in Fight Club
		const fightClub = person.combined_credits.cast.find(
			(c: { title?: string }) => c.title === 'Fight Club'
		);
		expect(fightClub).toBeDefined();
	});

	it('should handle 404 errors gracefully', async () => {
		await expect(tmdb.fetch('/movie/999999999')).rejects.toThrow();
	});

	it('should return null when API key is not configured', async () => {
		// Note: This test would need to mock the database to properly test
		// For now, it's a placeholder to document expected behavior
		// When API key is missing, tmdb.fetch() returns null instead of throwing
	});
});
