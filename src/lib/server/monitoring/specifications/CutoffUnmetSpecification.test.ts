/**
 * CutoffUnmetSpecification Unit Tests
 *
 * Tests for the specification that determines if an existing file's quality
 * is below the profile's upgradeUntilScore cutoff, making it eligible for upgrades.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	MovieCutoffUnmetSpecification,
	EpisodeCutoffUnmetSpecification,
	isMovieCutoffUnmet,
	isEpisodeCutoffUnmet
} from './CutoffUnmetSpecification.js';
import type { MovieContext, EpisodeContext } from './types.js';
import { RejectionReason } from './types.js';

// Test profiles for mocking
const TEST_PROFILES: Record<string, any> = {
	best: {
		id: 'best',
		name: 'Best',
		upgradesAllowed: true,
		minScore: 0,
		upgradeUntilScore: 15000,
		minScoreIncrement: 100,
		formatScores: {
			'2160p-remux': 20000,
			'2160p-bluray': 15000,
			'2160p-webdl': 8000,
			'1080p-remux': 12000,
			'1080p-bluray': 8000,
			'1080p-webdl': 4000,
			'720p-webdl': 1500,
			'audio-truehd-atmos': 3000
		}
	},
	'no-cutoff': {
		id: 'no-cutoff',
		name: 'No Cutoff',
		upgradesAllowed: true,
		minScore: 0,
		upgradeUntilScore: -1,
		minScoreIncrement: 0,
		formatScores: {
			'2160p-remux': 20000,
			'1080p-webdl': 4000
		}
	},
	'no-upgrades': {
		id: 'no-upgrades',
		name: 'No Upgrades',
		upgradesAllowed: false,
		minScore: 0,
		upgradeUntilScore: 15000,
		minScoreIncrement: 0,
		formatScores: {}
	},
	'low-cutoff': {
		id: 'low-cutoff',
		name: 'Low Cutoff',
		upgradesAllowed: true,
		minScore: 0,
		upgradeUntilScore: 5000,
		minScoreIncrement: 0,
		formatScores: {
			'2160p-remux': 20000,
			'1080p-bluray': 8000,
			'1080p-webdl': 4000,
			'720p-webdl': 1500
		}
	},
	'custom-profile': {
		id: 'custom-profile',
		name: 'Custom Profile',
		upgradesAllowed: true,
		minScore: 0,
		upgradeUntilScore: 12000,
		minScoreIncrement: 100,
		formatScores: {
			'2160p-remux': 25000,
			'2160p-bluray': 18000,
			'1080p-bluray': 10000,
			'1080p-webdl': 5000,
			'720p-webdl': 2000
		}
	}
};

// Mock qualityFilter.getProfile to return test profiles (handles both built-in and custom)
vi.mock('$lib/server/quality', () => ({
	qualityFilter: {
		getProfile: vi.fn(async (id: string) => TEST_PROFILES[id] ?? null)
	}
}));

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

	describe('Cutoff Logic', () => {
		it('should accept when existing file is BELOW cutoff (room for improvement)', async () => {
			const context: MovieContext = {
				movie: { id: '1', title: 'Test Movie' } as any,
				// 1080p WebDL scores ~4000, cutoff is 15000
				existingFile: { sceneName: 'Test.Movie.2024.1080p.WEB-DL.DDP5.1-GROUP' } as any,
				profile: { id: 'best', upgradesAllowed: true, upgradeUntilScore: 15000 } as any
			};

			const result = await spec.isSatisfied(context);

			expect(result.accepted).toBe(true);
		});

		it('should reject when existing file is AT cutoff', async () => {
			const context: MovieContext = {
				movie: { id: '1', title: 'Test Movie' } as any,
				// 2160p BluRay scores ~15000, cutoff is 15000
				existingFile: { sceneName: 'Test.Movie.2024.2160p.UHD.BluRay.x265-GROUP' } as any,
				profile: { id: 'best', upgradesAllowed: true, upgradeUntilScore: 15000 } as any
			};

			const result = await spec.isSatisfied(context);

			expect(result.accepted).toBe(false);
			expect(result.reason).toBe(RejectionReason.ALREADY_AT_CUTOFF);
		});

		it('should reject when existing file is ABOVE cutoff', async () => {
			const context: MovieContext = {
				movie: { id: '1', title: 'Test Movie' } as any,
				// 2160p Remux + Atmos scores ~23000, cutoff is 15000
				existingFile: {
					sceneName: 'Test.Movie.2024.2160p.UHD.BluRay.REMUX.TrueHD.Atmos-GROUP'
				} as any,
				profile: { id: 'best', upgradesAllowed: true, upgradeUntilScore: 15000 } as any
			};

			const result = await spec.isSatisfied(context);

			expect(result.accepted).toBe(false);
			expect(result.reason).toBe(RejectionReason.ALREADY_AT_CUTOFF);
		});

		it('should accept when no cutoff defined (upgradeUntilScore = -1)', async () => {
			const context: MovieContext = {
				movie: { id: '1', title: 'Test Movie' } as any,
				// Even very high quality file should allow upgrades with no cutoff
				existingFile: {
					sceneName: 'Test.Movie.2024.2160p.UHD.BluRay.REMUX.TrueHD.Atmos-GROUP'
				} as any,
				profile: { id: 'no-cutoff', upgradesAllowed: true, upgradeUntilScore: -1 } as any
			};

			const result = await spec.isSatisfied(context);

			expect(result.accepted).toBe(true);
		});

		it('should accept when upgradeUntilScore is 0 (treated as no cutoff)', async () => {
			const context: MovieContext = {
				movie: { id: '1', title: 'Test Movie' } as any,
				existingFile: { sceneName: 'Test.Movie.2024.1080p.WEB-DL-GROUP' } as any,
				profile: { id: 'no-cutoff', upgradesAllowed: true, upgradeUntilScore: 0 } as any
			};

			const result = await spec.isSatisfied(context);

			expect(result.accepted).toBe(true);
		});
	});

	describe('Different Quality Levels', () => {
		it('720p WebDL should be below low cutoff (5000)', async () => {
			const context: MovieContext = {
				movie: { id: '1', title: 'Test Movie' } as any,
				// 720p WebDL scores ~1500, cutoff is 5000
				existingFile: { sceneName: 'Test.Movie.2024.720p.WEB-DL-GROUP' } as any,
				profile: { id: 'low-cutoff', upgradesAllowed: true, upgradeUntilScore: 5000 } as any
			};

			const result = await spec.isSatisfied(context);

			expect(result.accepted).toBe(true);
		});

		it('1080p BluRay should be above low cutoff (5000)', async () => {
			const context: MovieContext = {
				movie: { id: '1', title: 'Test Movie' } as any,
				// 1080p BluRay scores ~8000, cutoff is 5000
				existingFile: { sceneName: 'Test.Movie.2024.1080p.BluRay.x264-GROUP' } as any,
				profile: { id: 'low-cutoff', upgradesAllowed: true, upgradeUntilScore: 5000 } as any
			};

			const result = await spec.isSatisfied(context);

			expect(result.accepted).toBe(false);
			expect(result.reason).toBe(RejectionReason.ALREADY_AT_CUTOFF);
		});
	});

	describe('Convenience Functions', () => {
		it('isMovieCutoffUnmet should return true when below cutoff', async () => {
			const context: MovieContext = {
				movie: { id: '1', title: 'Test Movie' } as any,
				existingFile: { sceneName: 'Test.Movie.2024.1080p.WEB-DL-GROUP' } as any,
				profile: { id: 'best', upgradesAllowed: true, upgradeUntilScore: 15000 } as any
			};

			const result = await isMovieCutoffUnmet(context);

			expect(result).toBe(true);
		});

		it('isMovieCutoffUnmet should return false when at/above cutoff', async () => {
			const context: MovieContext = {
				movie: { id: '1', title: 'Test Movie' } as any,
				existingFile: { sceneName: 'Test.Movie.2024.2160p.UHD.BluRay.REMUX-GROUP' } as any,
				profile: { id: 'best', upgradesAllowed: true, upgradeUntilScore: 15000 } as any
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

	it('should accept when episode file is below cutoff', async () => {
		const context: EpisodeContext = {
			series: { id: '1', title: 'Test Show' } as any,
			episode: { id: '1', seasonNumber: 1, episodeNumber: 1 } as any,
			existingFile: { sceneName: 'Test.Show.S01E01.1080p.WEB-DL-GROUP' } as any,
			profile: { id: 'best', upgradesAllowed: true, upgradeUntilScore: 15000 } as any
		};

		const result = await spec.isSatisfied(context);

		expect(result.accepted).toBe(true);
	});

	it('should reject when episode file is at cutoff', async () => {
		const context: EpisodeContext = {
			series: { id: '1', title: 'Test Show' } as any,
			episode: { id: '1', seasonNumber: 1, episodeNumber: 1 } as any,
			existingFile: { sceneName: 'Test.Show.S01E01.2160p.UHD.BluRay.REMUX-GROUP' } as any,
			profile: { id: 'best', upgradesAllowed: true, upgradeUntilScore: 15000 } as any
		};

		const result = await spec.isSatisfied(context);

		expect(result.accepted).toBe(false);
		expect(result.reason).toBe(RejectionReason.ALREADY_AT_CUTOFF);
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

describe('Custom Profile Support', () => {
	let spec: MovieCutoffUnmetSpecification;

	beforeEach(() => {
		spec = new MovieCutoffUnmetSpecification();
	});

	it('should work with custom profiles (non-built-in)', async () => {
		const context: MovieContext = {
			movie: { id: '1', title: 'Test Movie' } as any,
			// 720p WebDL should be below the custom profile cutoff of 12000
			existingFile: { sceneName: 'Test.Movie.2024.720p.WEB-DL-GROUP' } as any,
			profile: { id: 'custom-profile', upgradesAllowed: true, upgradeUntilScore: 12000 } as any
		};

		const result = await spec.isSatisfied(context);

		expect(result.accepted).toBe(true);
	});

	it('should reject when at cutoff with custom profile', async () => {
		const context: MovieContext = {
			movie: { id: '1', title: 'Test Movie' } as any,
			// 2160p BluRay (18000) should be above the custom profile cutoff of 12000
			existingFile: { sceneName: 'Test.Movie.2024.2160p.UHD.BluRay.x265-GROUP' } as any,
			profile: { id: 'custom-profile', upgradesAllowed: true, upgradeUntilScore: 12000 } as any
		};

		const result = await spec.isSatisfied(context);

		expect(result.accepted).toBe(false);
		expect(result.reason).toBe(RejectionReason.ALREADY_AT_CUTOFF);
	});

	it('should reject unknown custom profile IDs', async () => {
		const context: MovieContext = {
			movie: { id: '1', title: 'Test Movie' } as any,
			existingFile: { sceneName: 'Test.Movie.2024.1080p.WEB-DL-GROUP' } as any,
			profile: { id: 'nonexistent-profile', upgradesAllowed: true, upgradeUntilScore: 15000 } as any
		};

		const result = await spec.isSatisfied(context);

		expect(result.accepted).toBe(false);
		expect(result.reason).toBe(RejectionReason.NO_PROFILE);
	});
});
