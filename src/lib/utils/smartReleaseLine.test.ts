import { describe, it, expect } from 'vitest';
import { getSmartReleaseLine } from './smartReleaseLine.js';

describe('getSmartReleaseLine', () => {
	const now = new Date('2026-06-10');

	it('returns availableDigital when digital date is past', () => {
		const result = getSmartReleaseLine(
			{ releaseDate: '2026-05-01', digitalReleaseDate: '2026-06-01', physicalReleaseDate: null },
			now
		);
		expect(result).toEqual({ key: 'availableDigital', variant: 'released' });
	});

	it('returns availablePhysical when only physical is past', () => {
		const result = getSmartReleaseLine(
			{ releaseDate: '2026-04-01', digitalReleaseDate: null, physicalReleaseDate: '2026-06-05' },
			now
		);
		expect(result).toEqual({ key: 'availablePhysical', variant: 'released' });
	});

	it('returns availableStreaming when a TV/streaming date is past', () => {
		const result = getSmartReleaseLine(
			{
				releaseDate: '2026-04-01',
				digitalReleaseDate: null,
				physicalReleaseDate: null,
				tvReleaseDate: '2026-05-01'
			},
			now
		);
		expect(result).toEqual({ key: 'availableStreaming', variant: 'released' });
	});

	it('returns digitalInDays when in theaters with known digital date', () => {
		const result = getSmartReleaseLine(
			{ releaseDate: '2026-05-08', digitalReleaseDate: '2026-07-01', physicalReleaseDate: null },
			now
		);
		expect(result).toEqual({ key: 'digitalInDays', params: { days: 21 }, variant: 'upcoming' });
	});

	it('returns physicalInDays when physical comes before digital', () => {
		const result = getSmartReleaseLine(
			{
				releaseDate: '2026-05-08',
				digitalReleaseDate: '2026-08-01',
				physicalReleaseDate: '2026-06-20'
			},
			now
		);
		expect(result).toEqual({ key: 'physicalInDays', params: { days: 10 }, variant: 'upcoming' });
	});

	it('returns inTheaters when in theaters with no digital/physical date', () => {
		const result = getSmartReleaseLine(
			{ releaseDate: '2026-05-08', digitalReleaseDate: null, physicalReleaseDate: null },
			now
		);
		expect(result).toEqual({ key: 'inTheaters', variant: 'theaters' });
	});

	it('returns released for an old theatrical-only title (past the 3-year fallback)', () => {
		const result = getSmartReleaseLine(
			{
				releaseDate: '1957-04-10',
				digitalReleaseDate: null,
				physicalReleaseDate: null,
				status: 'Released'
			},
			now
		);
		expect(result).toEqual({ key: 'released', variant: 'released' });
	});

	it('keeps inTheaters for a recent theatrical-only title (within the 3-year window)', () => {
		const result = getSmartReleaseLine(
			{
				releaseDate: '2025-01-01',
				digitalReleaseDate: null,
				physicalReleaseDate: null,
				status: 'Released'
			},
			now
		);
		expect(result).toEqual({ key: 'inTheaters', variant: 'theaters' });
	});

	it('shows Available - Digital when a digital date is past, regardless of theatrical age', () => {
		const result = getSmartReleaseLine(
			{
				releaseDate: '1942-01-15',
				digitalReleaseDate: '2008-04-15',
				physicalReleaseDate: null,
				status: 'Released'
			},
			now
		);
		expect(result).toEqual({ key: 'availableDigital', variant: 'released' });
	});

	it('returns inTheaters when theatrical is past and TMDB status is not Released', () => {
		const result = getSmartReleaseLine(
			{
				releaseDate: '2026-05-08',
				digitalReleaseDate: null,
				physicalReleaseDate: null,
				status: 'Post Production'
			},
			now
		);
		expect(result).toEqual({ key: 'inTheaters', variant: 'theaters' });
	});

	it('returns comingToTheaters when theatrical date is in the future', () => {
		const result = getSmartReleaseLine(
			{ releaseDate: '2026-06-20', digitalReleaseDate: null, physicalReleaseDate: null },
			now
		);
		expect(result).toEqual({
			key: 'comingToTheaters',
			params: { days: 10 },
			variant: 'upcoming'
		});
	});

	it('returns announced when no dates known', () => {
		const result = getSmartReleaseLine(
			{ releaseDate: null, digitalReleaseDate: null, physicalReleaseDate: null },
			now
		);
		expect(result).toEqual({ key: 'announced', variant: 'announced' });
	});

	it('returns null for null input', () => {
		const result = getSmartReleaseLine(null, now);
		expect(result).toBeNull();
	});

	it('returns null for undefined input', () => {
		const result = getSmartReleaseLine(undefined, now);
		expect(result).toBeNull();
	});
});
