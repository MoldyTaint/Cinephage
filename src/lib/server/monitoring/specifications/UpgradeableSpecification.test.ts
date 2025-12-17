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

// Test profiles for mocking
const TEST_PROFILES: Record<string, any> = {
	best: {
		id: 'best',
		name: 'Best',
		upgradesAllowed: true,
		minScore: 0,
		upgradeUntilScore: 50000,
		minScoreIncrement: 100,
		formatScores: {
			'2160p-remux': 20000,
			'2160p-bluray': 15000,
			'2160p-webdl': 8000,
			'1080p-remux': 12000,
			'1080p-bluray': 8000,
			'1080p-webdl': 4000,
			'1080p-webrip': 2000,
			'720p-webdl': 1500,
			'audio-truehd-atmos': 3000,
			'audio-truehd': 2500,
			'audio-ddp': 500
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
			'2160p-remux': 20000,
			'1080p-webdl': 4000,
			'1080p-bluray': 8000
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
			'2160p-remux': 20000,
			'1080p-webdl': 4000,
			'1080p-bluray': 8000
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
			'2160p-remux': 25000,
			'2160p-bluray': 18000,
			'1080p-bluray': 10000,
			'1080p-webdl': 5000
		}
	}
};

// Mock qualityFilter.getProfile to return test profiles (handles both built-in and custom)
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
				movie: { id: '1', title: 'Test Movie' } as any,
				existingFile: null,
				profile: { id: 'best', upgradesAllowed: true } as any
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
				movie: { id: '1', title: 'Test Movie' } as any,
				existingFile: { sceneName: 'Test.Movie.2024.1080p.WEB-DL' } as any,
				profile: { id: 'best', upgradesAllowed: true } as any
			};

			const result = await spec.isSatisfied(context);

			expect(result.accepted).toBe(false);
			expect(result.reason).toBe('no_release_candidate');
		});

		it('should reject when no profile', async () => {
			const context: MovieContext = {
				movie: { id: '1', title: 'Test Movie' } as any,
				existingFile: { sceneName: 'Test.Movie.2024.1080p.WEB-DL' } as any,
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
				movie: { id: '1', title: 'Test Movie' } as any,
				existingFile: { sceneName: 'Test.Movie.2024.1080p.WEB-DL.DDP5.1-GROUP' } as any,
				profile: { id: 'best', upgradesAllowed: true, minScoreIncrement: 100 } as any
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
				movie: { id: '1', title: 'Test Movie' } as any,
				existingFile: {
					sceneName: 'Test.Movie.2024.2160p.UHD.BluRay.REMUX.TrueHD.Atmos-GROUP'
				} as any,
				profile: { id: 'best', upgradesAllowed: true, minScoreIncrement: 100 } as any
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
				movie: { id: '1', title: 'Test Movie' } as any,
				existingFile: { sceneName: 'Test.Movie.2024.1080p.WEB-DL-GROUP' } as any,
				profile: { id: 'no-upgrades', upgradesAllowed: false } as any
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
				movie: { id: '1', title: 'Test Movie' } as any,
				existingFile: { sceneName: 'Test.Movie.2024.1080p.WEB-DL-GROUP' } as any,
				profile: { id: 'high-increment', upgradesAllowed: true, minScoreIncrement: 5000 } as any
			};
			// 1080p BluRay is only ~4000 points higher than 1080p WebDL
			const release: ReleaseCandidate = {
				title: 'Test.Movie.2024.1080p.BluRay.x264-GROUP',
				score: 8000
			};

			const result = await spec.isSatisfied(context, release);

			expect(result.accepted).toBe(false);
			// Could be QUALITY_NOT_BETTER or IMPROVEMENT_TOO_SMALL depending on actual score diff
		});

		it('should accept upgrade even when candidate exceeds cutoff (cutoff only limits search initiation)', async () => {
			const context: MovieContext = {
				movie: { id: '1', title: 'Test Movie' } as any,
				// Existing file is lower quality
				existingFile: { sceneName: 'Test.Movie.2024.1080p.BluRay.x264-GROUP' } as any,
				profile: {
					id: 'low-cutoff',
					upgradesAllowed: true,
					upgradeUntilScore: 5000,
					minScoreIncrement: 0
				} as any
			};
			const release: ReleaseCandidate = {
				title: 'Test.Movie.2024.2160p.UHD.BluRay.REMUX-GROUP',
				score: 20000
			};

			const result = await spec.isSatisfied(context, release);

			// Should accept because it's an upgrade - cutoff only controls whether we SEARCH,
			// not whether we accept good releases when found
			expect(result.accepted).toBe(true);
		});
	});

	describe('Convenience Functions', () => {
		it('isMovieUpgrade should return boolean', async () => {
			const context: MovieContext = {
				movie: { id: '1', title: 'Test Movie' } as any,
				existingFile: { sceneName: 'Test.Movie.2024.1080p.WEB-DL-GROUP' } as any,
				profile: { id: 'best', upgradesAllowed: true, minScoreIncrement: 100 } as any
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
			series: { id: '1', title: 'Test Show' } as any,
			episode: { id: '1', seasonNumber: 1, episodeNumber: 1 } as any,
			existingFile: { sceneName: 'Test.Show.S01E01.1080p.WEB-DL-GROUP' } as any,
			profile: { id: 'best', upgradesAllowed: true, minScoreIncrement: 100 } as any
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
			series: { id: '1', title: 'Test Show' } as any,
			episode: { id: '1', seasonNumber: 1, episodeNumber: 1 } as any,
			existingFile: { sceneName: 'Test.Show.S01E01.2160p.UHD.BluRay.REMUX-GROUP' } as any,
			profile: { id: 'best', upgradesAllowed: true, minScoreIncrement: 100 } as any
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
			series: { id: '1', title: 'Test Show' } as any,
			episode: { id: '1', seasonNumber: 1, episodeNumber: 1 } as any,
			existingFile: { sceneName: 'Test.Show.S01E01.1080p.WEB-DL-GROUP' } as any,
			profile: { id: 'best', upgradesAllowed: true, minScoreIncrement: 100 } as any
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
			movie: { id: '1', title: 'Test Movie' } as any,
			existingFile: { sceneName: 'Test.Movie.2024.1080p.WEB-DL.DDP5.1-GROUP' } as any,
			profile: { id: 'custom-profile', upgradesAllowed: true, minScoreIncrement: 100 } as any
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
			movie: { id: '1', title: 'Test Movie' } as any,
			existingFile: { sceneName: 'Test.Movie.2024.1080p.WEB-DL-GROUP' } as any,
			profile: { id: 'nonexistent-profile', upgradesAllowed: true, minScoreIncrement: 100 } as any
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
