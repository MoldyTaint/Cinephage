import { describe, it, expect } from 'vitest';
import { getSmartReleaseLine } from './smartReleaseLine.js';

describe('getSmartReleaseLine', () => {
	const now = new Date('2026-06-10');

	it('returns "Available - Digital" when digital date is past', () => {
		const result = getSmartReleaseLine(
			{ releaseDate: '2026-05-01', digitalReleaseDate: '2026-06-01', physicalReleaseDate: null },
			now
		);
		expect(result).toEqual({ text: 'Available - Digital', variant: 'released' });
	});

	it('returns "Available - Physical" when only physical is past', () => {
		const result = getSmartReleaseLine(
			{ releaseDate: '2026-04-01', digitalReleaseDate: null, physicalReleaseDate: '2026-06-05' },
			now
		);
		expect(result).toEqual({ text: 'Available - Physical', variant: 'released' });
	});

	it('returns "Digital in N days" when in theaters with known digital date', () => {
		const result = getSmartReleaseLine(
			{ releaseDate: '2026-05-08', digitalReleaseDate: '2026-07-01', physicalReleaseDate: null },
			now
		);
		expect(result).toEqual({ text: 'Digital in 21 days', variant: 'upcoming' });
	});

	it('returns "Physical in N days" when physical comes before digital', () => {
		const result = getSmartReleaseLine(
			{
				releaseDate: '2026-05-08',
				digitalReleaseDate: '2026-08-01',
				physicalReleaseDate: '2026-06-20'
			},
			now
		);
		expect(result).toEqual({ text: 'Physical in 10 days', variant: 'upcoming' });
	});

	it('returns "In Theaters" when in theaters with no digital/physical date', () => {
		const result = getSmartReleaseLine(
			{ releaseDate: '2026-05-08', digitalReleaseDate: null, physicalReleaseDate: null },
			now
		);
		expect(result).toEqual({ text: 'In Theaters', variant: 'theaters' });
	});

	it('returns "Available" when theatrical is past and TMDB status is Released', () => {
		const result = getSmartReleaseLine(
			{
				releaseDate: '1957-04-10',
				digitalReleaseDate: null,
				physicalReleaseDate: null,
				status: 'Released'
			},
			now
		);
		expect(result).toEqual({ text: 'Available', variant: 'released' });
	});

	it('returns "In Theaters" when theatrical is past and TMDB status is not Released', () => {
		const result = getSmartReleaseLine(
			{
				releaseDate: '2026-05-08',
				digitalReleaseDate: null,
				physicalReleaseDate: null,
				status: 'Post Production'
			},
			now
		);
		expect(result).toEqual({ text: 'In Theaters', variant: 'theaters' });
	});

	it('returns "In Theaters in N days" when theatrical date is in future', () => {
		const result = getSmartReleaseLine(
			{ releaseDate: '2026-06-20', digitalReleaseDate: null, physicalReleaseDate: null },
			now
		);
		expect(result).toEqual({ text: 'In Theaters in 10 days', variant: 'upcoming' });
	});

	it('returns "Announced" when no dates known', () => {
		const result = getSmartReleaseLine(
			{ releaseDate: null, digitalReleaseDate: null, physicalReleaseDate: null },
			now
		);
		expect(result).toEqual({ text: 'Announced', variant: 'announced' });
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
