import { describe, expect, it } from 'vitest';
import { ReleaseEnricher } from './ReleaseEnricher';
import type { EnrichmentOptions } from './ReleaseEnricher';
import type { EpisodeInfo } from '../indexers/parser/types';

function resolveSeasonPackEpisodeCount(
	enricher: ReleaseEnricher,
	episodeInfo: EpisodeInfo | undefined,
	options: EnrichmentOptions
): number | undefined {
	return (
		enricher as unknown as {
			resolveSeasonPackEpisodeCount: (
				episodeInfo: EpisodeInfo | undefined,
				options: EnrichmentOptions
			) => number | undefined;
		}
	).resolveSeasonPackEpisodeCount(episodeInfo, options);
}

describe('ReleaseEnricher season pack episode count resolution', () => {
	it('prefers explicit seasonEpisodeCount when provided', () => {
		const enricher = new ReleaseEnricher();
		const episodeInfo: EpisodeInfo = {
			season: 2,
			isSeasonPack: true,
			isCompleteSeries: false,
			isDaily: false
		};

		const result = resolveSeasonPackEpisodeCount(enricher, episodeInfo, {
			seasonEpisodeCount: 22,
			seriesEpisodeCount: 999
		});

		expect(result).toBe(22);
	});

	it('uses seriesEpisodeCount for complete-series packs', () => {
		const enricher = new ReleaseEnricher();
		const episodeInfo: EpisodeInfo = {
			isSeasonPack: true,
			isCompleteSeries: true,
			isDaily: false
		};

		const result = resolveSeasonPackEpisodeCount(enricher, episodeInfo, {
			seriesEpisodeCount: 91
		});

		expect(result).toBe(91);
	});

	it('sums per-season counts for multi-season packs', () => {
		const enricher = new ReleaseEnricher();
		const episodeInfo: EpisodeInfo = {
			seasons: [1, 2, 3],
			isSeasonPack: true,
			isCompleteSeries: false,
			isDaily: false
		};

		const result = resolveSeasonPackEpisodeCount(enricher, episodeInfo, {
			seasonEpisodeCounts: new Map([
				[1, 13],
				[2, 22],
				[3, 19]
			])
		});

		expect(result).toBe(54);
	});

	it('returns undefined when any parsed season count is missing', () => {
		const enricher = new ReleaseEnricher();
		const episodeInfo: EpisodeInfo = {
			seasons: [1, 2, 3],
			isSeasonPack: true,
			isCompleteSeries: false,
			isDaily: false
		};

		const result = resolveSeasonPackEpisodeCount(enricher, episodeInfo, {
			seasonEpisodeCounts: new Map([
				[1, 13],
				[2, 22]
			])
		});

		expect(result).toBeUndefined();
	});
});
