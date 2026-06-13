import { describe, it, expect, beforeEach } from 'vitest';
import {
	MovieCutoffUnmetSpecification,
	EpisodeCutoffUnmetSpecification,
	isMovieCutoffUnmet,
	isEpisodeCutoffUnmet
} from './CutoffUnmetSpecification.js';
import type { MovieContext, EpisodeContext } from './types.js';
import { RejectionReason } from './types.js';
import {
	createMovie,
	createMovieFile,
	createEpisodeFile,
	createSeries,
	createEpisode
} from '../../../../test/fixtures/media.js';
import { createScoringProfile } from '../../../../test/fixtures/releases.js';

// Typed adapter consts (arrow functions, not FunctionDeclarations - not subject to the create* ban)
const testMovieFile = (
	overrides?: Parameters<typeof createMovieFile>[0]
): MovieContext['existingFile'] =>
	createMovieFile(overrides) as unknown as MovieContext['existingFile'];
const testEpisodeFile = (
	overrides?: Parameters<typeof createEpisodeFile>[0]
): EpisodeContext['existingFile'] =>
	createEpisodeFile(overrides) as unknown as EpisodeContext['existingFile'];
const testProfile = (
	overrides?: Parameters<typeof createScoringProfile>[0]
): MovieContext['profile'] => createScoringProfile(overrides) as unknown as MovieContext['profile'];
const testEpisode = (overrides?: Parameters<typeof createEpisode>[0]): EpisodeContext['episode'] =>
	createEpisode(overrides) as unknown as EpisodeContext['episode'];

function createMovieContext(overrides: Partial<MovieContext> = {}): MovieContext {
	return {
		movie: createMovie({ id: '1', tmdbId: 1 }) as unknown as MovieContext['movie'],
		existingFile: createMovieFile({
			id: '1',
			movieId: '1',
			relativePath: 'Test.Movie.2024.1080p.WEB-DL.mkv',
			sceneName: 'Test.Movie.2024.1080p.WEB-DL'
		}) as unknown as MovieContext['existingFile'],
		profile: createScoringProfile({
			id: 'best',
			name: 'Best',
			upgradesAllowed: true,
			upgradeUntilScore: 15000
		}) as unknown as MovieContext['profile'],
		...overrides
	};
}

function createEpisodeContext(overrides: Partial<EpisodeContext> = {}): EpisodeContext {
	return {
		series: createSeries({ id: '1', tmdbId: 1 }) as unknown as EpisodeContext['series'],
		episode: createEpisode({
			id: '1',
			seriesId: '1',
			seasonNumber: 1,
			episodeNumber: 1
		}) as unknown as EpisodeContext['episode'],
		existingFile: createEpisodeFile({
			id: '1',
			seriesId: '1',
			seasonNumber: 1,
			relativePath: 'Test.Show.S01E01.1080p.WEB-DL.mkv',
			sceneName: 'Test.Show.S01E01.1080p.WEB-DL'
		}) as unknown as EpisodeContext['existingFile'],
		profile: createScoringProfile({
			id: 'best',
			name: 'Best',
			upgradesAllowed: true,
			upgradeUntilScore: 15000
		}) as unknown as EpisodeContext['profile'],
		...overrides
	};
}

describe('MovieCutoffUnmetSpecification', () => {
	let spec: MovieCutoffUnmetSpecification;

	beforeEach(() => {
		spec = new MovieCutoffUnmetSpecification();
	});

	describe('Basic Validation', () => {
		it('should reject when no existing file', async () => {
			const context = createMovieContext({ existingFile: null });

			const result = await spec.isSatisfied(context);

			expect(result.accepted).toBe(false);
			expect(result.reason).toBe('no_existing_file');
		});

		it('should reject when no profile', async () => {
			const context = createMovieContext({ profile: null });

			const result = await spec.isSatisfied(context);

			expect(result.accepted).toBe(false);
			expect(result.reason).toBe(RejectionReason.NO_PROFILE);
		});

		it('should reject when upgrades not allowed', async () => {
			const context = createMovieContext({
				profile: testProfile({ upgradesAllowed: false })
			});

			const result = await spec.isSatisfied(context);

			expect(result.accepted).toBe(false);
			expect(result.reason).toBe(RejectionReason.UPGRADES_NOT_ALLOWED);
		});
	});

	describe('No Hard Cutoff Behavior', () => {
		it('should accept when existing file is below cutoff score (upgrades allowed)', async () => {
			const context = createMovieContext({
				existingFile: testMovieFile({
					sceneName: 'Test.Movie.2024.1080p.WEB-DL.DDP5.1-GROUP'
				}),
				profile: testProfile()
			});

			const result = await spec.isSatisfied(context);

			expect(result.accepted).toBe(true);
		});

		it('should accept when existing file is AT cutoff score (no hard cutoff)', async () => {
			const context = createMovieContext({
				existingFile: testMovieFile({
					sceneName: 'Test.Movie.2024.2160p.UHD.BluRay.x265-GROUP'
				}),
				profile: testProfile()
			});

			const result = await spec.isSatisfied(context);

			expect(result.accepted).toBe(true);
		});

		it('should accept when existing file is ABOVE cutoff score (no hard cutoff)', async () => {
			const context = createMovieContext({
				existingFile: testMovieFile({
					sceneName: 'Test.Movie.2024.2160p.UHD.BluRay.REMUX.TrueHD.Atmos-GROUP'
				}),
				profile: testProfile()
			});

			const result = await spec.isSatisfied(context);

			expect(result.accepted).toBe(true);
		});

		it('should accept when no cutoff defined (upgradeUntilScore = -1)', async () => {
			const context = createMovieContext({
				existingFile: testMovieFile({
					sceneName: 'Test.Movie.2024.2160p.UHD.BluRay.REMUX.TrueHD.Atmos-GROUP'
				}),
				profile: testProfile({ upgradeUntilScore: -1 })
			});

			const result = await spec.isSatisfied(context);

			expect(result.accepted).toBe(true);
		});

		it('should accept when upgradeUntilScore is 0', async () => {
			const context = createMovieContext({
				existingFile: testMovieFile({
					sceneName: 'Test.Movie.2024.1080p.WEB-DL-GROUP'
				}),
				profile: testProfile({ upgradeUntilScore: 0 })
			});

			const result = await spec.isSatisfied(context);

			expect(result.accepted).toBe(true);
		});
	});

	describe('Different Quality Levels - All Accept When Upgrades Allowed', () => {
		it('720p WebDL should be eligible for upgrades', async () => {
			const context = createMovieContext({
				existingFile: testMovieFile({
					sceneName: 'Test.Movie.2024.720p.WEB-DL-GROUP'
				}),
				profile: testProfile({ upgradeUntilScore: 5000 })
			});

			const result = await spec.isSatisfied(context);

			expect(result.accepted).toBe(true);
		});

		it('1080p BluRay should be eligible for upgrades (no hard cutoff)', async () => {
			const context = createMovieContext({
				existingFile: testMovieFile({
					sceneName: 'Test.Movie.2024.1080p.BluRay.x264-GROUP'
				}),
				profile: testProfile({ upgradeUntilScore: 5000 })
			});

			const result = await spec.isSatisfied(context);

			expect(result.accepted).toBe(true);
		});
	});

	describe('Convenience Functions', () => {
		it('isMovieCutoffUnmet should return true when upgrades allowed', async () => {
			const context = createMovieContext({
				existingFile: testMovieFile({
					sceneName: 'Test.Movie.2024.1080p.WEB-DL-GROUP'
				}),
				profile: testProfile()
			});

			const result = await isMovieCutoffUnmet(context);

			expect(result).toBe(true);
		});

		it('isMovieCutoffUnmet should return true even for high quality files (no hard cutoff)', async () => {
			const context = createMovieContext({
				existingFile: testMovieFile({
					sceneName: 'Test.Movie.2024.2160p.UHD.BluRay.REMUX-GROUP'
				}),
				profile: testProfile()
			});

			const result = await isMovieCutoffUnmet(context);

			expect(result).toBe(true);
		});

		it('isMovieCutoffUnmet should return false when upgrades not allowed', async () => {
			const context = createMovieContext({
				existingFile: testMovieFile({
					sceneName: 'Test.Movie.2024.720p.WEB-DL-GROUP'
				}),
				profile: testProfile({ upgradesAllowed: false })
			});

			const result = await isMovieCutoffUnmet(context);

			expect(result).toBe(false);
		});
	});
});

describe('EpisodeCutoffUnmetSpecification', () => {
	let spec: EpisodeCutoffUnmetSpecification;

	beforeEach(() => {
		spec = new EpisodeCutoffUnmetSpecification();
	});

	it('should accept when upgrades allowed', async () => {
		const context = createEpisodeContext({
			existingFile: testEpisodeFile({
				sceneName: 'Test.Show.S01E01.1080p.WEB-DL-GROUP'
			}),
			profile: testProfile()
		});

		const result = await spec.isSatisfied(context);

		expect(result.accepted).toBe(true);
	});

	it('should accept even for high quality files (no hard cutoff)', async () => {
		const context = createEpisodeContext({
			existingFile: testEpisodeFile({
				sceneName: 'Test.Show.S01E01.2160p.UHD.BluRay.REMUX-GROUP'
			}),
			profile: testProfile()
		});

		const result = await spec.isSatisfied(context);

		expect(result.accepted).toBe(true);
	});

	it('should reject when upgrades not allowed', async () => {
		const context = createEpisodeContext({
			existingFile: testEpisodeFile({
				sceneName: 'Test.Show.S01E01.720p.WEB-DL-GROUP'
			}),
			profile: testProfile({ upgradesAllowed: false })
		});

		const result = await spec.isSatisfied(context);

		expect(result.accepted).toBe(false);
		expect(result.reason).toBe(RejectionReason.UPGRADES_NOT_ALLOWED);
	});

	it('isEpisodeCutoffUnmet should return boolean', async () => {
		const context = createEpisodeContext({
			existingFile: testEpisodeFile({
				sceneName: 'Test.Show.S01E01.720p.WEB-DL-GROUP'
			}),
			profile: testProfile()
		});

		const result = await isEpisodeCutoffUnmet(context);

		expect(typeof result).toBe('boolean');
		expect(result).toBe(true);
	});
});

describe('Profile upgradesAllowed is the key factor', () => {
	let movieSpec: MovieCutoffUnmetSpecification;
	let episodeSpec: EpisodeCutoffUnmetSpecification;

	beforeEach(() => {
		movieSpec = new MovieCutoffUnmetSpecification();
		episodeSpec = new EpisodeCutoffUnmetSpecification();
	});

	it('should always accept when upgradesAllowed is true regardless of quality', async () => {
		const context = createMovieContext({
			existingFile: testMovieFile({
				sceneName: 'Test.Movie.2024.2160p.REMUX.TrueHD.Atmos-GROUP'
			}),
			profile: testProfile({ upgradesAllowed: true, upgradeUntilScore: 1 })
		});

		const result = await movieSpec.isSatisfied(context);
		expect(result.accepted).toBe(true);
	});

	it('should always reject when upgradesAllowed is false regardless of quality', async () => {
		const context = createMovieContext({
			existingFile: testMovieFile({
				sceneName: 'Test.Movie.2024.480p.HDTV-GROUP'
			}),
			profile: testProfile({ upgradesAllowed: false, upgradeUntilScore: 100000 })
		});

		const result = await movieSpec.isSatisfied(context);
		expect(result.accepted).toBe(false);
		expect(result.reason).toBe(RejectionReason.UPGRADES_NOT_ALLOWED);
	});

	it('should accept episode when upgradesAllowed is true', async () => {
		const context = createEpisodeContext({
			episode: testEpisode({ title: 'Test Episode' }),
			existingFile: testEpisodeFile({
				sceneName: 'Test.Show.S01E01.1080p.WEB-DL'
			}),
			profile: testProfile({ upgradesAllowed: true })
		});

		const result = await episodeSpec.isSatisfied(context);
		expect(result.accepted).toBe(true);
	});

	it('should reject episode when upgradesAllowed is false', async () => {
		const context = createEpisodeContext({
			episode: testEpisode({ title: 'Test Episode' }),
			existingFile: testEpisodeFile({
				sceneName: 'Test.Show.S01E01.1080p.WEB-DL'
			}),
			profile: testProfile({ upgradesAllowed: false })
		});

		const result = await episodeSpec.isSatisfied(context);
		expect(result.accepted).toBe(false);
		expect(result.reason).toBe(RejectionReason.UPGRADES_NOT_ALLOWED);
	});
});
