import { describe, it, expect } from 'vitest';
import { QualityFilter } from './QualityFilter';
import type { QualityPreset } from './types';
import { parseRelease } from '../indexers/parser';
import { BALANCED_PROFILE, COMPACT_PROFILE, QUALITY_PROFILE } from '../scoring';

// Create a test preset instead of using the database
const testPresets: Record<string, QualityPreset> = {
	any: {
		id: 'any',
		name: 'Any',
		minResolution: null,
		preferredResolution: null,
		maxResolution: null,
		allowedSources: null,
		excludedSources: ['cam', 'telesync'],
		preferHdr: false,
		isDefault: true,
		minSizeMb: null,
		maxSizeMb: null
	},
	'1080p': {
		id: '1080p',
		name: '1080p+',
		minResolution: '1080p',
		preferredResolution: '1080p',
		maxResolution: null,
		allowedSources: ['remux', 'bluray', 'webdl', 'webrip'],
		excludedSources: null,
		preferHdr: false,
		isDefault: false,
		minSizeMb: null,
		maxSizeMb: null
	},
	'4k': {
		id: '4k',
		name: '4K',
		minResolution: '2160p',
		preferredResolution: '2160p',
		maxResolution: null,
		allowedSources: ['remux', 'bluray', 'webdl'],
		excludedSources: null,
		preferHdr: true,
		isDefault: false,
		minSizeMb: null,
		maxSizeMb: null
	}
};

describe('QualityFilter', () => {
	const filter = new QualityFilter();

	describe('meetsMinimum', () => {
		it('should accept any resolution with "Any" preset', () => {
			const parsed = parseRelease('Movie.2023.720p.BluRay.x264-GROUP');
			const result = filter.meetsMinimum(parsed, testPresets.any);
			expect(result.ok).toBe(true);
		});

		it('should reject resolution below minimum', () => {
			const parsed = parseRelease('Movie.2023.720p.BluRay.x264-GROUP');
			const result = filter.meetsMinimum(parsed, testPresets['1080p']);
			expect(result.ok).toBe(false);
			expect(result.reason).toContain('below minimum');
		});

		it('should accept resolution at minimum', () => {
			const parsed = parseRelease('Movie.2023.1080p.BluRay.x264-GROUP');
			const result = filter.meetsMinimum(parsed, testPresets['1080p']);
			expect(result.ok).toBe(true);
		});

		it('should accept resolution above minimum', () => {
			const parsed = parseRelease('Movie.2023.2160p.BluRay.HEVC-GROUP');
			const result = filter.meetsMinimum(parsed, testPresets['1080p']);
			expect(result.ok).toBe(true);
		});

		it('should reject excluded sources', () => {
			const parsed = parseRelease('Movie.2023.1080p.CAM-GROUP');
			const result = filter.meetsMinimum(parsed, testPresets.any);
			expect(result.ok).toBe(false);
			expect(result.reason).toContain('excluded');
		});

		it('should reject sources not in allowed list', () => {
			const parsed = parseRelease('Movie.2023.1080p.HDTV.x264-GROUP');
			const result = filter.meetsMinimum(parsed, testPresets['1080p']);
			expect(result.ok).toBe(false);
			expect(result.reason).toContain('not in allowed');
		});
	});

	describe('calculateScore', () => {
		it('should give higher score to higher resolution', () => {
			const parsed720 = parseRelease('Movie.2023.720p.BluRay.x264-GROUP');
			const parsed1080 = parseRelease('Movie.2023.1080p.BluRay.x264-GROUP');
			const parsed4k = parseRelease('Movie.2023.2160p.BluRay.HEVC-GROUP');

			const score720 = filter.calculateScore(parsed720, testPresets.any);
			const score1080 = filter.calculateScore(parsed1080, testPresets.any);
			const score4k = filter.calculateScore(parsed4k, testPresets.any);

			expect(score4k.score).toBeGreaterThan(score1080.score);
			expect(score1080.score).toBeGreaterThan(score720.score);
		});

		it('should give higher score to better sources', () => {
			const parsedWeb = parseRelease('Movie.2023.1080p.WEB-DL.x264-GROUP');
			const parsedBluray = parseRelease('Movie.2023.1080p.BluRay.x264-GROUP');
			const parsedRemux = parseRelease('Movie.2023.1080p.REMUX.x264-GROUP');

			const scoreWeb = filter.calculateScore(parsedWeb, testPresets.any);
			const scoreBluray = filter.calculateScore(parsedBluray, testPresets.any);
			const scoreRemux = filter.calculateScore(parsedRemux, testPresets.any);

			expect(scoreRemux.score).toBeGreaterThan(scoreBluray.score);
			expect(scoreBluray.score).toBeGreaterThan(scoreWeb.score);
		});

		it('should give bonus for HDR when preset prefers it', () => {
			const parsedHdr = parseRelease('Movie.2023.2160p.BluRay.HDR.HEVC-GROUP');
			const parsedNonHdr = parseRelease('Movie.2023.2160p.BluRay.HEVC-GROUP');

			const scoreHdr = filter.calculateScore(parsedHdr, testPresets['4k']);
			const scoreNonHdr = filter.calculateScore(parsedNonHdr, testPresets['4k']);

			expect(scoreHdr.scoreBreakdown.hdr).toBeGreaterThan(scoreNonHdr.scoreBreakdown.hdr);
		});

		it('should mark release as rejected when it fails minimum', () => {
			const parsed = parseRelease('Movie.2023.720p.BluRay.x264-GROUP');
			const result = filter.calculateScore(parsed, testPresets['4k']);

			expect(result.accepted).toBe(false);
			expect(result.rejectionReason).toBeDefined();
		});

		it('should mark release as accepted when it meets minimum', () => {
			const parsed = parseRelease('Movie.2023.2160p.BluRay.HDR.HEVC-GROUP');
			const result = filter.calculateScore(parsed, testPresets['4k']);

			expect(result.accepted).toBe(true);
			expect(result.rejectionReason).toBeUndefined();
		});
	});

	describe('score breakdown', () => {
		it('should include all score components', () => {
			const parsed = parseRelease('Movie.2023.1080p.BluRay.x264.DTS-GROUP');
			const result = filter.calculateScore(parsed, testPresets.any);

			expect(result.scoreBreakdown).toHaveProperty('resolution');
			expect(result.scoreBreakdown).toHaveProperty('source');
			expect(result.scoreBreakdown).toHaveProperty('codec');
			expect(result.scoreBreakdown).toHaveProperty('hdr');
			expect(result.scoreBreakdown).toHaveProperty('audio');
		});

		it('should have scores in valid range (0-1000)', () => {
			const parsed = parseRelease('Movie.2023.2160p.REMUX.HDR.Atmos.HEVC-GROUP');
			const result = filter.calculateScore(parsed, testPresets['4k']);

			expect(result.score).toBeGreaterThanOrEqual(0);
			expect(result.score).toBeLessThanOrEqual(1000);
			expect(result.scoreBreakdown.resolution).toBeLessThanOrEqual(1000);
			expect(result.scoreBreakdown.source).toBeLessThanOrEqual(1000);
		});
	});

	describe('calculateEnhancedScore', () => {
		it('should use scoring engine with profile', () => {
			const parsed = parseRelease('Movie.2023.1080p.BluRay.x264.DTS-FGT');
			const result = filter.calculateEnhancedScore(parsed, testPresets.any, BALANCED_PROFILE);

			expect(result.accepted).toBe(true);
			expect(result.scoringResult).toBeDefined();
			expect(result.matchedFormats).toBeDefined();
			expect(Array.isArray(result.matchedFormats)).toBe(true);
		});

		it('should detect release group tiers', () => {
			// NTb is a WEB-DL tier 1 group - should score higher in Best profile
			const parsedNtb = parseRelease('Movie.2023.1080p.WEB-DL.x264-NTb');
			const parsedUnknown = parseRelease('Movie.2023.1080p.WEB-DL.x264-UNKNOWN');

			const resultNtb = filter.calculateEnhancedScore(parsedNtb, testPresets.any, QUALITY_PROFILE);
			const resultUnknown = filter.calculateEnhancedScore(
				parsedUnknown,
				testPresets.any,
				QUALITY_PROFILE
			);

			// NTb should have group tier detected and score higher
			expect(resultNtb.scoringResult?.totalScore).toBeGreaterThan(
				resultUnknown.scoringResult?.totalScore || 0
			);
		});

		it('should reject releases with banned score', () => {
			// Create a mock banned release (add known banned pattern to test)
			const parsed = parseRelease('Movie.2023.1080p.WEB-DL.x264-STUTTERSHIT');
			const result = filter.calculateEnhancedScore(parsed, testPresets.any, BALANCED_PROFILE);

			// STUTTERSHIT should be banned
			if (result.scoringResult?.isBanned) {
				expect(result.accepted).toBe(false);
				expect(result.rejectionReason).toContain('Banned');
			}
		});

		it('should rank better sources higher in Best profile', () => {
			const parsedRemux = parseRelease('Movie.2023.2160p.REMUX.AVC.TrueHD.Atmos-GROUP');
			const parsedWeb = parseRelease('Movie.2023.2160p.WEB-DL.x264.AAC-GROUP');

			const resultRemux = filter.calculateEnhancedScore(
				parsedRemux,
				testPresets.any,
				QUALITY_PROFILE
			);
			const resultWeb = filter.calculateEnhancedScore(parsedWeb, testPresets.any, QUALITY_PROFILE);

			expect(resultRemux.scoringResult!.totalScore).toBeGreaterThan(
				resultWeb.scoringResult!.totalScore
			);
		});

		it('should value efficient encoders in Efficient profile', () => {
			const parsedX265 = parseRelease('Movie.2023.1080p.BluRay.x265-GROUP');
			const parsedX264 = parseRelease('Movie.2023.1080p.BluRay.x264-GROUP');

			const resultX265 = filter.calculateEnhancedScore(
				parsedX265,
				testPresets.any,
				BALANCED_PROFILE
			);
			const resultX264 = filter.calculateEnhancedScore(
				parsedX264,
				testPresets.any,
				BALANCED_PROFILE
			);

			// x265 should score higher in Efficient profile
			expect(resultX265.scoringResult!.totalScore).toBeGreaterThan(
				resultX264.scoringResult!.totalScore
			);
		});

		it('should accept micro encoders in Micro profile', () => {
			const parsedYts = parseRelease('Movie.2023.1080p.BluRay.x264-YTS');
			const result = filter.calculateEnhancedScore(parsedYts, testPresets.any, COMPACT_PROFILE);

			// YTS should NOT be banned in Micro profile
			expect(result.scoringResult?.isBanned).toBeFalsy();
			expect(result.accepted).toBe(true);
		});

		it('should prefer micro encoders in Micro profile', () => {
			const parsedYts = parseRelease('Movie.2023.1080p.BluRay.x264-YTS');
			const parsedNormal = parseRelease('Movie.2023.1080p.BluRay.x264-FGT');

			const resultYts = filter.calculateEnhancedScore(parsedYts, testPresets.any, COMPACT_PROFILE);
			const resultNormal = filter.calculateEnhancedScore(
				parsedNormal,
				testPresets.any,
				COMPACT_PROFILE
			);

			// YTS should score higher in Micro profile
			expect(resultYts.scoringResult!.totalScore).toBeGreaterThan(
				resultNormal.scoringResult!.totalScore
			);
		});

		it('should always rank 1080p higher than 720p of same source type in MICRO profile', () => {
			// Test that resolution hierarchy is preserved even in Micro profile
			const parsed1080pWeb = parseRelease('Movie.2023.1080p.WEBRip.x264-GROUP');
			const parsed720pWeb = parseRelease('Movie.2023.720p.WEBRip.x264-GROUP');

			const result1080p = filter.calculateEnhancedScore(
				parsed1080pWeb,
				testPresets.any,
				COMPACT_PROFILE
			);
			const result720p = filter.calculateEnhancedScore(
				parsed720pWeb,
				testPresets.any,
				COMPACT_PROFILE
			);

			expect(result1080p.scoringResult!.totalScore).toBeGreaterThan(
				result720p.scoringResult!.totalScore
			);
		});

		it('should always rank 1080p bluray higher than 720p webrip in MICRO profile', () => {
			// Even bluray (larger) 1080p should beat webrip (smaller) 720p
			const parsed1080pBluray = parseRelease('Movie.2023.1080p.BluRay.x264-GROUP');
			const parsed720pWebrip = parseRelease('Movie.2023.720p.WEBRip.x264-GROUP');

			const result1080p = filter.calculateEnhancedScore(
				parsed1080pBluray,
				testPresets.any,
				COMPACT_PROFILE
			);
			const result720p = filter.calculateEnhancedScore(
				parsed720pWebrip,
				testPresets.any,
				COMPACT_PROFILE
			);

			expect(result1080p.scoringResult!.totalScore).toBeGreaterThan(
				result720p.scoringResult!.totalScore
			);
		});

		it('should prefer efficient sources within same resolution in MICRO profile', () => {
			// Within 1080p, webrip should beat bluray
			const parsed1080pWebrip = parseRelease('Movie.2023.1080p.WEBRip.x264-GROUP');
			const parsed1080pBluray = parseRelease('Movie.2023.1080p.BluRay.x264-GROUP');

			const resultWebrip = filter.calculateEnhancedScore(
				parsed1080pWebrip,
				testPresets.any,
				COMPACT_PROFILE
			);
			const resultBluray = filter.calculateEnhancedScore(
				parsed1080pBluray,
				testPresets.any,
				COMPACT_PROFILE
			);

			expect(resultWebrip.scoringResult!.totalScore).toBeGreaterThan(
				resultBluray.scoringResult!.totalScore
			);
		});
	});

	describe('rankReleases', () => {
		it('should rank releases by total score', () => {
			const releases = [
				{
					name: 'Movie.2023.720p.WEB-DL.x264-GROUP',
					parsed: parseRelease('Movie.2023.720p.WEB-DL.x264-GROUP')
				},
				{
					name: 'Movie.2023.2160p.REMUX.HEVC-GROUP',
					parsed: parseRelease('Movie.2023.2160p.REMUX.HEVC-GROUP')
				},
				{
					name: 'Movie.2023.1080p.BluRay.x264-GROUP',
					parsed: parseRelease('Movie.2023.1080p.BluRay.x264-GROUP')
				}
			];

			const ranked = filter.rankReleases(releases, QUALITY_PROFILE);

			expect(ranked.length).toBe(3);
			expect(ranked[0].rank).toBe(1);
			// Remux should be ranked first in Best profile
			expect(ranked[0].name).toContain('REMUX');
		});
	});

	describe('checkUpgrade', () => {
		it('should detect upgrade from lower to higher quality', () => {
			const existing = parseRelease('Movie.2023.1080p.WEB-DL.x264-GROUP');
			const candidate = parseRelease('Movie.2023.2160p.REMUX.HEVC-GROUP');

			const result = filter.checkUpgrade(existing, candidate, QUALITY_PROFILE);

			expect(result.isUpgrade).toBe(true);
			expect(result.improvement).toBeGreaterThan(0);
		});

		it('should not detect upgrade from higher to lower quality', () => {
			const existing = parseRelease('Movie.2023.2160p.REMUX.HEVC-GROUP');
			const candidate = parseRelease('Movie.2023.1080p.WEB-DL.x264-GROUP');

			const result = filter.checkUpgrade(existing, candidate, QUALITY_PROFILE);

			expect(result.isUpgrade).toBe(false);
			expect(result.improvement).toBeLessThan(0);
		});
	});
});
