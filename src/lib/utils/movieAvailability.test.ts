import { describe, it, expect } from 'vitest';
import { getMovieAvailabilityLevel } from './movieAvailability';

describe('getMovieAvailabilityLevel', () => {
	const now = new Date('2026-02-20T00:00:00.000Z');

	it('uses TMDB released status when available', () => {
		const availability = getMovieAvailabilityLevel(
			{
				year: 2026,
				added: '2026-02-19T00:00:00.000Z',
				tmdbStatus: 'Released'
			},
			now
		);

		expect(availability).toBe('released');
	});

	it('uses TMDB pre-release statuses as announced', () => {
		const availability = getMovieAvailabilityLevel(
			{
				year: 2026,
				added: '2026-02-19T00:00:00.000Z',
				tmdbStatus: 'In Production'
			},
			now
		);

		expect(availability).toBe('announced');
	});

	it('uses release date when status is unknown', () => {
		const availability = getMovieAvailabilityLevel(
			{
				year: 2026,
				added: '2026-02-19T00:00:00.000Z',
				releaseDate: '2026-01-27'
			},
			now
		);

		expect(availability).toBe('released');
	});

	it('falls back to legacy heuristics when TMDB metadata is missing', () => {
		const availability = getMovieAvailabilityLevel(
			{
				year: 2026,
				added: '2026-02-19T00:00:00.000Z'
			},
			now
		);

		expect(availability).toBe('inCinemas');
	});
});
