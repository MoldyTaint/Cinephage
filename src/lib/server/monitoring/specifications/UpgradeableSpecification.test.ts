/**
 * UpgradeableSpecification Unit Tests
 *
 * Tests for the specification that determines if a release qualifies
 * as an upgrade over an existing file.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	MovieUpgradeableSpecification,
	EpisodeUpgradeableSpecification,
	isMovieUpgrade,
	isEpisodeUpgrade
} from './UpgradeableSpecification.js';
import type { MovieContext, EpisodeContext, ReleaseCandidate } from './types.js';
import { RejectionReason } from './types.js';
import type {
	movies,
	movieFiles,
	series,
	episodes,
	episodeFiles,
	scoringProfiles
} from '$lib/server/db/schema';

type Movie = typeof movies.$inferSelect;
type MovieFile = typeof movieFiles.$inferSelect;
type Series = typeof series.$inferSelect;
type Episode = typeof episodes.$inferSelect;
type EpisodeFile = typeof episodeFiles.$inferSelect;
type ScoringProfile = typeof scoringProfiles.$inferSelect;

function createTestMovie(overrides: Partial<Movie> = {}): Movie {
	return {
		id: '1',
		tmdbId: 123,
		imdbId: null,
		title: 'Test Movie',
		originalTitle: null,
		year: null,
		overview: null,
		posterPath: null,
		backdropPath: null,
		runtime: null,
		genres: null,
		path: '/movies/test-movie',
		libraryId: null,
		rootFolderId: null,
		scoringProfileId: null,
		languageProfileId: null,
		monitored: true,
		minimumAvailability: 'released',
		added: '2024-01-01T00:00:00.000Z',
		hasFile: false,
		wantsSubtitles: true,
		lastSearchTime: null,
		failedSubtitleAttempts: 0,
		firstSubtitleSearchAt: null,
		...overrides
	} as Movie;
}

function createTestMovieFile(overrides: Partial<MovieFile> = {}): MovieFile {
	return {
		id: '1',
		movieId: '1',
		relativePath: 'test.mkv',
		size: null,
		dateAdded: '2024-01-01T00:00:00.000Z',
		sceneName: null,
		releaseGroup: null,
		quality: null,
		mediaInfo: null,
		edition: null,
		languages: null,
		infoHash: null,
		...overrides
	} as MovieFile;
}

function createTestSeries(overrides: Partial<Series> = {}): Series {
	return {
		id: '1',
		tmdbId: 456,
		tvdbId: null,
		imdbId: null,
		title: 'Test Show',
		originalTitle: null,
		year: null,
		overview: null,
		posterPath: null,
		backdropPath: null,
		status: null,
		network: null,
		genres: null,
		path: '/series/test-show',
		libraryId: null,
		rootFolderId: null,
		scoringProfileId: null,
		languageProfileId: null,
		monitored: true,
		monitorNewItems: 'all',
		monitorSpecials: false,
		seasonFolder: true,
		seriesType: 'standard',
		added: '2024-01-01T00:00:00.000Z',
		episodeCount: 0,
		episodeFileCount: 0,
		wantsSubtitles: true,
		...overrides
	} as Series;
}

function createTestEpisode(overrides: Partial<Episode> = {}): Episode {
	return {
		id: '1',
		seriesId: '1',
		seasonId: null,
		tmdbId: null,
		tvdbId: null,
		seasonNumber: 1,
		episodeNumber: 1,
		absoluteEpisodeNumber: null,
		title: null,
		overview: null,
		airDate: null,
		runtime: null,
		monitored: true,
		hasFile: false,
		wantsSubtitlesOverride: null,
		lastSearchTime: null,
		failedSubtitleAttempts: 0,
		firstSubtitleSearchAt: null,
		...overrides
	} as Episode;
}

function createTestEpisodeFile(overrides: Partial<EpisodeFile> = {}): EpisodeFile {
	return {
		id: '1',
		seriesId: '1',
		seasonNumber: 1,
		episodeIds: null,
		relativePath: 'test.mkv',
		size: null,
		dateAdded: '2024-01-01T00:00:00.000Z',
		sceneName: null,
		releaseGroup: null,
		edition: null,
		releaseType: null,
		quality: null,
		mediaInfo: null,
		languages: null,
		infoHash: null,
		...overrides
	} as EpisodeFile;
}

function createTestProfile(overrides: Partial<ScoringProfile> = {}): ScoringProfile {
	return {
		id: 'best',
		name: 'Best',
		description: null,
		tags: null,
		upgradesAllowed: true,
		minScore: 0,
		upgradeUntilScore: 50000,
		minScoreIncrement: 100,
		resolutionOrder: null,
		formatScores: null,
		allowedProtocols: null,
		isDefault: false,
		movieMinSizeGb: null,
		movieMaxSizeGb: null,
		episodeMinSizeMb: null,
		episodeMaxSizeMb: null,
		createdAt: '2024-01-01T00:00:00.000Z',
		updatedAt: '2024-01-01T00:00:00.000Z',
		...overrides
	} as ScoringProfile;
}

const TEST_PROFILES: Record<string, Record<string, unknown>> = {
	best: {
		id: 'best',
		name: 'Best',
		upgradesAllowed: true,
		minScore: 0,
		upgradeUntilScore: 50000,
		minScoreIncrement: 100,
		formatScores: {
			'resolution-2160p': 500,
			'resolution-1080p': 300,
			'source-remux': 400,
			'source-bluray': 300,
			'source-webdl': 200,
			'codec-x264': 50
		}
	},
	'no-upgrades': {
		id: 'no-upgrades',
		name: 'No Upgrades',
		upgradesAllowed: false,
		minScore: 0,
		upgradeUntilScore: -1,
		minScoreIncrement: 0,
		formatScores: {}
	},
	'high-increment': {
		id: 'high-increment',
		name: 'High Increment',
		upgradesAllowed: true,
		minScore: 0,
		upgradeUntilScore: 50000,
		minScoreIncrement: 5000,
		formatScores: {
			'resolution-2160p': 500,
			'source-bluray': 300,
			'source-webdl': 200
		}
	},
	'low-cutoff': {
		id: 'low-cutoff',
		name: 'Low Cutoff',
		upgradesAllowed: true,
		minScore: 0,
		upgradeUntilScore: 5000,
		minScoreIncrement: 0,
		formatScores: {
			'resolution-2160p': 500,
			'resolution-1080p': 300,
			'source-bluray': 300,
			'source-remux': 400,
			'codec-x264': 50
		}
	},
	'custom-profile': {
		id: 'custom-profile',
		name: 'Custom Profile',
		upgradesAllowed: true,
		minScore: 0,
		upgradeUntilScore: 30000,
		minScoreIncrement: 100,
		formatScores: {
			'resolution-2160p': 500,
			'source-remux': 400,
			'source-bluray': 300
		}
	}
};

vi.mock('$lib/server/quality', () => ({
	qualityFilter: {
		getProfile: vi.fn(async (id: string) => TEST_PROFILES[id] ?? null)
	}
}));

describe('MovieUpgradeableSpecification', () => {
	let spec: MovieUpgradeableSpecification;

	beforeEach(() => {
		spec = new MovieUpgradeableSpecification();
	});

	describe('Basic Validation', () => {
		it('should reject when no existing file', async () => {
			const context: MovieContext = {
				movie: createTestMovie(),
				existingFile: null,
				profile: createTestProfile()
			};
			const release: ReleaseCandidate = {
				title: 'Test.Movie.2024.2160p.REMUX',
				score: 20000
			};

			const result = await spec.isSatisfied(context, release);

			expect(result.accepted).toBe(false);
			expect(result.reason).toBe('no_existing_file');
		});

		it('should reject when no release candidate', async () => {
			const context: MovieContext = {
				movie: createTestMovie(),
				existingFile: createTestMovieFile({ sceneName: 'Test.Movie.2024.1080p.WEB-DL' }),
				profile: createTestProfile()
			};

			const result = await spec.isSatisfied(context);

			expect(result.accepted).toBe(false);
			expect(result.reason).toBe('no_release_candidate');
		});

		it('should reject when no profile', async () => {
			const context: MovieContext = {
				movie: createTestMovie(),
				existingFile: createTestMovieFile({ sceneName: 'Test.Movie.2024.1080p.WEB-DL' }),
				profile: null
			};
			const release: ReleaseCandidate = {
				title: 'Test.Movie.2024.2160p.REMUX',
				score: 20000
			};

			const result = await spec.isSatisfied(context, release);

			expect(result.accepted).toBe(false);
			expect(result.reason).toBe(RejectionReason.NO_PROFILE);
		});
	});

	describe('Upgrade Decisions', () => {
		it('should accept upgrade from 1080p WebDL to 2160p Remux', async () => {
			const context: MovieContext = {
				movie: createTestMovie(),
				existingFile: createTestMovieFile({
					sceneName: 'Test.Movie.2024.1080p.WEB-DL.DDP5.1-GROUP'
				}),
				profile: createTestProfile({ id: 'best', upgradesAllowed: true, minScoreIncrement: 100 })
			};
			const release: ReleaseCandidate = {
				title: 'Test.Movie.2024.2160p.UHD.BluRay.REMUX.TrueHD.Atmos-GROUP',
				score: 23000
			};

			const result = await spec.isSatisfied(context, release);

			expect(result.accepted).toBe(true);
		});

		it('should reject downgrade from 2160p Remux to 1080p WebDL', async () => {
			const context: MovieContext = {
				movie: createTestMovie(),
				existingFile: createTestMovieFile({
					sceneName: 'Test.Movie.2024.2160p.UHD.BluRay.REMUX.TrueHD.Atmos-GROUP'
				}),
				profile: createTestProfile({ id: 'best', upgradesAllowed: true, minScoreIncrement: 100 })
			};
			const release: ReleaseCandidate = {
				title: 'Test.Movie.2024.1080p.WEB-DL.DDP5.1-GROUP',
				score: 4500
			};

			const result = await spec.isSatisfied(context, release);

			expect(result.accepted).toBe(false);
			expect(result.reason).toBe(RejectionReason.QUALITY_NOT_BETTER);
		});

		it('should reject when upgrades not allowed', async () => {
			const context: MovieContext = {
				movie: createTestMovie(),
				existingFile: createTestMovieFile({ sceneName: 'Test.Movie.2024.1080p.WEB-DL-GROUP' }),
				profile: createTestProfile({ id: 'no-upgrades', upgradesAllowed: false })
			};
			const release: ReleaseCandidate = {
				title: 'Test.Movie.2024.2160p.UHD.BluRay.REMUX-GROUP',
				score: 20000
			};

			const result = await spec.isSatisfied(context, release);

			expect(result.accepted).toBe(false);
			expect(result.reason).toBe(RejectionReason.UPGRADES_NOT_ALLOWED);
		});

		it('should reject when improvement below minScoreIncrement', async () => {
			const context: MovieContext = {
				movie: createTestMovie(),
				existingFile: createTestMovieFile({ sceneName: 'Test.Movie.2024.1080p.WEB-DL-GROUP' }),
				profile: createTestProfile({
					id: 'high-increment',
					upgradesAllowed: true,
					minScoreIncrement: 5000
				})
			};
			const release: ReleaseCandidate = {
				title: 'Test.Movie.2024.1080p.BluRay.x264-GROUP',
				score: 8000
			};

			const result = await spec.isSatisfied(context, release);

			expect(result.accepted).toBe(false);
		});

		it('should accept upgrade even when candidate exceeds cutoff (cutoff only limits search initiation)', async () => {
			const context: MovieContext = {
				movie: createTestMovie(),
				existingFile: createTestMovieFile({
					sceneName: 'Test.Movie.2024.1080p.BluRay.x264-GROUP'
				}),
				profile: createTestProfile({
					id: 'low-cutoff',
					upgradesAllowed: true,
					upgradeUntilScore: 5000,
					minScoreIncrement: 0
				})
			};
			const release: ReleaseCandidate = {
				title: 'Test.Movie.2024.2160p.UHD.BluRay.REMUX-GROUP',
				score: 20000
			};

			const result = await spec.isSatisfied(context, release);

			expect(result.accepted).toBe(true);
		});
	});

	describe('Convenience Functions', () => {
		it('isMovieUpgrade should return boolean', async () => {
			const context: MovieContext = {
				movie: createTestMovie(),
				existingFile: createTestMovieFile({
					sceneName: 'Test.Movie.2024.1080p.WEB-DL-GROUP'
				}),
				profile: createTestProfile({ id: 'best', upgradesAllowed: true, minScoreIncrement: 100 })
			};
			const release: ReleaseCandidate = {
				title: 'Test.Movie.2024.2160p.UHD.BluRay.REMUX-GROUP',
				score: 20000
			};

			const result = await isMovieUpgrade(context, release);

			expect(typeof result).toBe('boolean');
			expect(result).toBe(true);
		});
	});
});

describe('EpisodeUpgradeableSpecification', () => {
	let spec: EpisodeUpgradeableSpecification;

	beforeEach(() => {
		spec = new EpisodeUpgradeableSpecification();
	});

	it('should accept upgrade for episode', async () => {
		const context: EpisodeContext = {
			series: createTestSeries(),
			episode: createTestEpisode(),
			existingFile: createTestEpisodeFile({
				sceneName: 'Test.Show.S01E01.1080p.WEB-DL-GROUP'
			}),
			profile: createTestProfile({ id: 'best', upgradesAllowed: true, minScoreIncrement: 100 })
		};
		const release: ReleaseCandidate = {
			title: 'Test.Show.S01E01.2160p.UHD.BluRay.REMUX-GROUP',
			score: 20000
		};

		const result = await spec.isSatisfied(context, release);

		expect(result.accepted).toBe(true);
	});

	it('should reject downgrade for episode', async () => {
		const context: EpisodeContext = {
			series: createTestSeries(),
			episode: createTestEpisode(),
			existingFile: createTestEpisodeFile({
				sceneName: 'Test.Show.S01E01.2160p.UHD.BluRay.REMUX-GROUP'
			}),
			profile: createTestProfile({ id: 'best', upgradesAllowed: true, minScoreIncrement: 100 })
		};
		const release: ReleaseCandidate = {
			title: 'Test.Show.S01E01.1080p.WEB-DL-GROUP',
			score: 4000
		};

		const result = await spec.isSatisfied(context, release);

		expect(result.accepted).toBe(false);
		expect(result.reason).toBe(RejectionReason.QUALITY_NOT_BETTER);
	});

	it('isEpisodeUpgrade should return boolean', async () => {
		const context: EpisodeContext = {
			series: createTestSeries(),
			episode: createTestEpisode(),
			existingFile: createTestEpisodeFile({
				sceneName: 'Test.Show.S01E01.1080p.WEB-DL-GROUP'
			}),
			profile: createTestProfile({ id: 'best', upgradesAllowed: true, minScoreIncrement: 100 })
		};
		const release: ReleaseCandidate = {
			title: 'Test.Show.S01E01.2160p.UHD.BluRay.REMUX-GROUP',
			score: 20000
		};

		const result = await isEpisodeUpgrade(context, release);

		expect(typeof result).toBe('boolean');
		expect(result).toBe(true);
	});
});

describe('Custom Profile Support', () => {
	let spec: MovieUpgradeableSpecification;

	beforeEach(() => {
		spec = new MovieUpgradeableSpecification();
	});

	it('should work with custom profiles (non-built-in)', async () => {
		const context: MovieContext = {
			movie: createTestMovie(),
			existingFile: createTestMovieFile({
				sceneName: 'Test.Movie.2024.1080p.WEB-DL.DDP5.1-GROUP'
			}),
			profile: createTestProfile({
				id: 'custom-profile',
				upgradesAllowed: true,
				minScoreIncrement: 100
			})
		};
		const release: ReleaseCandidate = {
			title: 'Test.Movie.2024.2160p.UHD.BluRay.REMUX.TrueHD.Atmos-GROUP',
			score: 25000
		};

		const result = await spec.isSatisfied(context, release);

		expect(result.accepted).toBe(true);
	});

	it('should reject unknown custom profile IDs', async () => {
		const context: MovieContext = {
			movie: createTestMovie(),
			existingFile: createTestMovieFile({
				sceneName: 'Test.Movie.2024.1080p.WEB-DL-GROUP'
			}),
			profile: createTestProfile({
				id: 'nonexistent-profile',
				upgradesAllowed: true,
				minScoreIncrement: 100
			})
		};
		const release: ReleaseCandidate = {
			title: 'Test.Movie.2024.2160p.UHD.BluRay.REMUX-GROUP',
			score: 20000
		};

		const result = await spec.isSatisfied(context, release);

		expect(result.accepted).toBe(false);
		expect(result.reason).toBe(RejectionReason.NO_PROFILE);
	});
});
