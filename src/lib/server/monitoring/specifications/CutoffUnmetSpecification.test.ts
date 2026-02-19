/**
 * CutoffUnmetSpecification Unit Tests
 *
 * Tests for the specification that determines if an existing file is eligible
 * for upgrade searching. Hard cutoffs have been removed - now simply checks
 * if upgrades are allowed by the profile.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
	MovieCutoffUnmetSpecification,
	EpisodeCutoffUnmetSpecification,
	isMovieCutoffUnmet,
	isEpisodeCutoffUnmet
} from './CutoffUnmetSpecification.js';
import type { MovieContext, EpisodeContext } from './types.js';
import { RejectionReason } from './types.js';

describe('MovieCutoffUnmetSpecification', () => {
	let spec: MovieCutoffUnmetSpecification;

	beforeEach(() => {
		spec = new MovieCutoffUnmetSpecification();
	});

	describe('Basic Validation', () => {
		it('should reject when no existing file', async () => {
			const context: MovieContext = {
				movie: { id: '1', title: 'Test Movie' } as any,
				existingFile: null,
				profile: { id: 'best', upgradesAllowed: true, upgradeUntilScore: 15000 } as any
			};

			const result = await spec.isSatisfied(context);

			expect(result.accepted).toBe(false);
			expect(result.reason).toBe('no_existing_file');
		});

		it('should reject when no profile', async () => {
			const context: MovieContext = {
				movie: { id: '1', title: 'Test Movie' } as any,
				existingFile: { sceneName: 'Test.Movie.2024.1080p.WEB-DL' } as any,
				profile: null
			};

			const result = await spec.isSatisfied(context);

			expect(result.accepted).toBe(false);
			expect(result.reason).toBe(RejectionReason.NO_PROFILE);
		});

		it('should reject when upgrades not allowed', async () => {
			const context: MovieContext = {
				movie: { id: '1', title: 'Test Movie' } as any,
				existingFile: { sceneName: 'Test.Movie.2024.1080p.WEB-DL' } as any,
				profile: { id: 'no-upgrades', upgradesAllowed: false, upgradeUntilScore: 15000 } as any
			};

			const result = await spec.isSatisfied(context);

			expect(result.accepted).toBe(false);
			expect(result.reason).toBe(RejectionReason.UPGRADES_NOT_ALLOWED);
		});
	});

	describe('No Hard Cutoff Behavior', () => {
		it('should accept when existing file is below cutoff score (upgrades allowed)', async () => {
			const context: MovieContext = {
				movie: { id: '1', title: 'Test Movie' } as any,
				// 1080p WebDL scores ~4000, cutoff is 15000
				existingFile: { sceneName: 'Test.Movie.2024.1080p.WEB-DL.DDP5.1-GROUP' } as any,
				profile: { id: 'best', upgradesAllowed: true, upgradeUntilScore: 15000 } as any
			};

			const result = await spec.isSatisfied(context);

			expect(result.accepted).toBe(true);
		});

		it('should accept when existing file is AT cutoff score (no hard cutoff)', async () => {
			const context: MovieContext = {
				movie: { id: '1', title: 'Test Movie' } as any,
				// 2160p BluRay scores ~15000, cutoff is 15000 - previously rejected, now accepts
				existingFile: { sceneName: 'Test.Movie.2024.2160p.UHD.BluRay.x265-GROUP' } as any,
				profile: { id: 'best', upgradesAllowed: true, upgradeUntilScore: 15000 } as any
			};

			const result = await spec.isSatisfied(context);

			// No hard cutoff anymore - always allow searching if upgrades enabled
			expect(result.accepted).toBe(true);
		});

		it('should accept when existing file is ABOVE cutoff score (no hard cutoff)', async () => {
			const context: MovieContext = {
				movie: { id: '1', title: 'Test Movie' } as any,
				// 2160p Remux + Atmos scores ~23000, cutoff is 15000 - previously rejected, now accepts
				existingFile: {
					sceneName: 'Test.Movie.2024.2160p.UHD.BluRay.REMUX.TrueHD.Atmos-GROUP'
				} as any,
				profile: { id: 'best', upgradesAllowed: true, upgradeUntilScore: 15000 } as any
			};

			const result = await spec.isSatisfied(context);

			// No hard cutoff anymore - always allow searching if upgrades enabled
			expect(result.accepted).toBe(true);
		});

		it('should accept when no cutoff defined (upgradeUntilScore = -1)', async () => {
			const context: MovieContext = {
				movie: { id: '1', title: 'Test Movie' } as any,
				existingFile: {
					sceneName: 'Test.Movie.2024.2160p.UHD.BluRay.REMUX.TrueHD.Atmos-GROUP'
				} as any,
				profile: { id: 'no-cutoff', upgradesAllowed: true, upgradeUntilScore: -1 } as any
			};

			const result = await spec.isSatisfied(context);

			expect(result.accepted).toBe(true);
		});

		it('should accept when upgradeUntilScore is 0', async () => {
			const context: MovieContext = {
				movie: { id: '1', title: 'Test Movie' } as any,
				existingFile: { sceneName: 'Test.Movie.2024.1080p.WEB-DL-GROUP' } as any,
				profile: { id: 'no-cutoff', upgradesAllowed: true, upgradeUntilScore: 0 } as any
			};

			const result = await spec.isSatisfied(context);

			expect(result.accepted).toBe(true);
		});
	});

	describe('Different Quality Levels - All Accept When Upgrades Allowed', () => {
		it('720p WebDL should be eligible for upgrades', async () => {
			const context: MovieContext = {
				movie: { id: '1', title: 'Test Movie' } as any,
				existingFile: { sceneName: 'Test.Movie.2024.720p.WEB-DL-GROUP' } as any,
				profile: { id: 'low-cutoff', upgradesAllowed: true, upgradeUntilScore: 5000 } as any
			};

			const result = await spec.isSatisfied(context);

			expect(result.accepted).toBe(true);
		});

		it('1080p BluRay should be eligible for upgrades (no hard cutoff)', async () => {
			const context: MovieContext = {
				movie: { id: '1', title: 'Test Movie' } as any,
				// 1080p BluRay scores ~8000, cutoff is 5000 - previously rejected, now accepts
				existingFile: { sceneName: 'Test.Movie.2024.1080p.BluRay.x264-GROUP' } as any,
				profile: { id: 'low-cutoff', upgradesAllowed: true, upgradeUntilScore: 5000 } as any
			};

			const result = await spec.isSatisfied(context);

			// No hard cutoff anymore
			expect(result.accepted).toBe(true);
		});
	});

	describe('Convenience Functions', () => {
		it('isMovieCutoffUnmet should return true when upgrades allowed', async () => {
			const context: MovieContext = {
				movie: { id: '1', title: 'Test Movie' } as any,
				existingFile: { sceneName: 'Test.Movie.2024.1080p.WEB-DL-GROUP' } as any,
				profile: { id: 'best', upgradesAllowed: true, upgradeUntilScore: 15000 } as any
			};

			const result = await isMovieCutoffUnmet(context);

			expect(result).toBe(true);
		});

		it('isMovieCutoffUnmet should return true even for high quality files (no hard cutoff)', async () => {
			const context: MovieContext = {
				movie: { id: '1', title: 'Test Movie' } as any,
				existingFile: { sceneName: 'Test.Movie.2024.2160p.UHD.BluRay.REMUX-GROUP' } as any,
				profile: { id: 'best', upgradesAllowed: true, upgradeUntilScore: 15000 } as any
			};

			const result = await isMovieCutoffUnmet(context);

			// No hard cutoff - always true if upgrades allowed
			expect(result).toBe(true);
		});

		it('isMovieCutoffUnmet should return false when upgrades not allowed', async () => {
			const context: MovieContext = {
				movie: { id: '1', title: 'Test Movie' } as any,
				existingFile: { sceneName: 'Test.Movie.2024.720p.WEB-DL-GROUP' } as any,
				profile: { id: 'no-upgrades', upgradesAllowed: false, upgradeUntilScore: 15000 } as any
			};

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
		const context: EpisodeContext = {
			series: { id: '1', title: 'Test Show' } as any,
			episode: { id: '1', seasonNumber: 1, episodeNumber: 1 } as any,
			existingFile: { sceneName: 'Test.Show.S01E01.1080p.WEB-DL-GROUP' } as any,
			profile: { id: 'best', upgradesAllowed: true, upgradeUntilScore: 15000 } as any
		};

		const result = await spec.isSatisfied(context);

		expect(result.accepted).toBe(true);
	});

	it('should accept even for high quality files (no hard cutoff)', async () => {
		const context: EpisodeContext = {
			series: { id: '1', title: 'Test Show' } as any,
			episode: { id: '1', seasonNumber: 1, episodeNumber: 1 } as any,
			existingFile: { sceneName: 'Test.Show.S01E01.2160p.UHD.BluRay.REMUX-GROUP' } as any,
			profile: { id: 'best', upgradesAllowed: true, upgradeUntilScore: 15000 } as any
		};

		const result = await spec.isSatisfied(context);

		// No hard cutoff anymore
		expect(result.accepted).toBe(true);
	});

	it('should reject when upgrades not allowed', async () => {
		const context: EpisodeContext = {
			series: { id: '1', title: 'Test Show' } as any,
			episode: { id: '1', seasonNumber: 1, episodeNumber: 1 } as any,
			existingFile: { sceneName: 'Test.Show.S01E01.720p.WEB-DL-GROUP' } as any,
			profile: { id: 'no-upgrades', upgradesAllowed: false, upgradeUntilScore: 15000 } as any
		};

		const result = await spec.isSatisfied(context);

		expect(result.accepted).toBe(false);
		expect(result.reason).toBe(RejectionReason.UPGRADES_NOT_ALLOWED);
	});

	it('isEpisodeCutoffUnmet should return boolean', async () => {
		const context: EpisodeContext = {
			series: { id: '1', title: 'Test Show' } as any,
			episode: { id: '1', seasonNumber: 1, episodeNumber: 1 } as any,
			existingFile: { sceneName: 'Test.Show.S01E01.720p.WEB-DL-GROUP' } as any,
			profile: { id: 'best', upgradesAllowed: true, upgradeUntilScore: 15000 } as any
		};

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
		// Even the highest quality file should be eligible for upgrades
		const context: MovieContext = {
			movie: { id: '1', title: 'Test Movie' } as any,
			existingFile: { sceneName: 'Test.Movie.2024.2160p.REMUX.TrueHD.Atmos-GROUP' } as any,
			profile: { id: 'custom', upgradesAllowed: true, upgradeUntilScore: 1 } as any
		};

		const result = await movieSpec.isSatisfied(context);
		expect(result.accepted).toBe(true);
	});

	it('should always reject when upgradesAllowed is false regardless of quality', async () => {
		// Even low quality file should not be eligible if upgrades disabled
		const context: MovieContext = {
			movie: { id: '1', title: 'Test Movie' } as any,
			existingFile: { sceneName: 'Test.Movie.2024.480p.HDTV-GROUP' } as any,
			profile: { id: 'custom', upgradesAllowed: false, upgradeUntilScore: 100000 } as any
		};

		const result = await movieSpec.isSatisfied(context);
		expect(result.accepted).toBe(false);
		expect(result.reason).toBe(RejectionReason.UPGRADES_NOT_ALLOWED);
	});

	it('should accept episode when upgradesAllowed is true', async () => {
		const context: EpisodeContext = {
			series: { id: '1', title: 'Test Series' } as any,
			episode: { id: '1', title: 'Test Episode' } as any,
			existingFile: { sceneName: 'Test.Show.S01E01.1080p.WEB-DL' } as any,
			profile: { id: 'custom', upgradesAllowed: true, upgradeUntilScore: 15000 } as any
		};

		const result = await episodeSpec.isSatisfied(context);
		expect(result.accepted).toBe(true);
	});

	it('should reject episode when upgradesAllowed is false', async () => {
		const context: EpisodeContext = {
			series: { id: '1', title: 'Test Series' } as any,
			episode: { id: '1', title: 'Test Episode' } as any,
			existingFile: { sceneName: 'Test.Show.S01E01.1080p.WEB-DL' } as any,
			profile: { id: 'custom', upgradesAllowed: false, upgradeUntilScore: 15000 } as any
		};

		const result = await episodeSpec.isSatisfied(context);
		expect(result.accepted).toBe(false);
		expect(result.reason).toBe(RejectionReason.UPGRADES_NOT_ALLOWED);
	});
});
