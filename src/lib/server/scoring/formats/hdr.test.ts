/**
 * HDR Format Tests
 *
 * Tests HDR format matching based on Profilarr test cases.
 * Uses regex patterns from the Profilarr database for validation.
 */

import { describe, it, expect } from 'vitest';
import {
	DOLBY_VISION_FORMAT,
	DOLBY_VISION_NO_FALLBACK_FORMAT,
	DOLBY_VISION_FORMATS,
	HDR10_PLUS_FORMAT,
	HDR10_FORMAT,
	HDR_GENERIC_FORMAT,
	HDR10_FORMATS,
	HLG_FORMAT,
	PQ_FORMAT,
	SDR_FORMAT,
	OTHER_HDR_FORMATS,
	MISSING_HDR_FORMATS,
	ALL_HDR_FORMATS
} from './hdr.js';

describe('HDR Format Matching', () => {
	// ==========================================================================
	// DOLBY VISION TESTS (from Profilarr)
	// ==========================================================================
	describe('Dolby Vision', () => {
		it('should find Dolby Vision format', () => {
			expect(DOLBY_VISION_FORMAT).toBeDefined();
		});

		// Profilarr test cases for Dolby Vision
		const testCases = [
			{
				input: 'MovieName.2023.4K.DV.HDR.mkv',
				shouldMatch: true,
				desc: 'DV abbreviation'
			},
			{
				input: 'MovieName.2023.4K.Dovi.HDR10+.mkv',
				shouldMatch: true,
				desc: 'Dovi'
			},
			{
				input: 'MovieName.2023.4K.Dolby.Vision.HDR.mkv',
				shouldMatch: true,
				desc: 'Dolby.Vision'
			},
			{
				input: 'MovieName.2023.4K.DolbyVision.HDR10+.mkv',
				shouldMatch: true,
				desc: 'DolbyVision no space'
			},
			{
				input: 'MovieName.2023.4K.Dolby Vision.HDR.mkv',
				shouldMatch: true,
				desc: 'Dolby Vision with space'
			},
			{
				input: 'MovieName.2023.4K.HDR10+.mkv',
				shouldMatch: false,
				desc: 'HDR10+ only (no DV)'
			},
			{
				input: 'MovieName.2023.4K.HDR.mkv',
				shouldMatch: false,
				desc: 'HDR only (no DV)'
			}
		];

		for (const tc of testCases) {
			it(`${tc.shouldMatch ? 'matches' : 'does not match'}: ${tc.desc}`, () => {
				const condition = DOLBY_VISION_FORMAT.conditions.find((c) => c.name === 'Dolby Vision');
				if (!condition?.pattern) return;
				const regex = new RegExp(condition.pattern, 'i');
				expect(regex.test(tc.input)).toBe(tc.shouldMatch);
			});
		}
	});

	// ==========================================================================
	// DOLBY VISION WITHOUT FALLBACK TESTS (from Profilarr)
	// ==========================================================================
	describe('Dolby Vision (Without Fallback)', () => {
		it('should find Dolby Vision Without Fallback format', () => {
			expect(DOLBY_VISION_NO_FALLBACK_FORMAT).toBeDefined();
		});

		// Profilarr test cases - these releases have DV but NO HDR fallback
		const noFallbackTestCases = [
			{
				input: 'Barbie.2023.2160p.MA.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-FLUX',
				hasDV: true,
				hasHDR: true,
				isNoFallback: false,
				desc: 'Has HDR fallback'
			},
			{
				input:
					'Barbie (2023) (2160p AMZN WEB-DL Hybrid H265 DV HDR10+ DDP Atmos 5.1 English - HONE)',
				hasDV: true,
				hasHDR: true,
				isNoFallback: false,
				desc: 'Has HDR10+ fallback'
			},
			{
				input: 'Barbie.2023.2160p.MA.WEB-DL.DDP5.1.Atmos.DV.H.265-FLUX',
				hasDV: true,
				hasHDR: false,
				isNoFallback: true,
				desc: 'WEB-DL with DV but NO HDR - no fallback'
			},
			{
				input:
					'Barbie (2023) 2160p UHD BluRay Hybrid REMUX HEVC DV HDR TrueHD Atmos 7.1 English-FraMeSToR',
				hasDV: true,
				hasHDR: true,
				isNoFallback: false,
				desc: 'REMUX typically has fallback'
			}
		];

		for (const tc of noFallbackTestCases) {
			it(`correctly evaluates: ${tc.desc}`, () => {
				// Check DV match
				const dvCondition = DOLBY_VISION_NO_FALLBACK_FORMAT.conditions.find(
					(c) => c.name === 'Dolby Vision'
				);
				if (dvCondition?.pattern) {
					const dvRegex = new RegExp(dvCondition.pattern, 'i');
					expect(dvRegex.test(tc.input)).toBe(tc.hasDV);
				}

				// Check HDR exclusion (should be negated in no-fallback)
				const hdrCondition = DOLBY_VISION_NO_FALLBACK_FORMAT.conditions.find(
					(c) => c.name === 'No HDR'
				);
				if (hdrCondition?.pattern) {
					const hdrRegex = new RegExp(hdrCondition.pattern, 'i');
					const hasHDR = hdrRegex.test(tc.input);
					// For no-fallback format to match, HDR must NOT be present
					if (tc.isNoFallback) {
						expect(hasHDR).toBe(false); // No HDR present in true no-fallback
					}
				}
			});
		}
	});

	// ==========================================================================
	// HDR10+ TESTS (from Profilarr)
	// ==========================================================================
	describe('HDR10+', () => {
		it('should find HDR10+ format', () => {
			expect(HDR10_PLUS_FORMAT).toBeDefined();
		});

		// Profilarr test cases for HDR10+
		const testCases = [
			{ input: 'HDR10+', shouldMatch: true, desc: 'HDR10+ exact' },
			{ input: 'HDR10Plus', shouldMatch: true, desc: 'HDR10Plus' },
			{ input: 'HDR10P', shouldMatch: true, desc: 'HDR10P' },
			{ input: 'HDR10 Plus', shouldMatch: true, desc: 'HDR10 Plus with space' },
			{ input: 'Movie.2024.2160p.HDR10+.HEVC-GROUP', shouldMatch: true, desc: 'in release name' },
			{ input: 'HDR', shouldMatch: false, desc: 'plain HDR' },
			{ input: 'HDR+', shouldMatch: false, desc: 'HDR+ (invalid)' },
			{ input: 'HDR10', shouldMatch: false, desc: 'HDR10 (no plus)' },
			{ input: 'HLG HDR', shouldMatch: false, desc: 'HLG HDR' }
		];

		for (const tc of testCases) {
			it(`${tc.shouldMatch ? 'matches' : 'does not match'}: ${tc.desc}`, () => {
				const condition = HDR10_PLUS_FORMAT.conditions.find((c) => c.name === 'HDR10+');
				if (!condition?.pattern) return;
				const regex = new RegExp(condition.pattern, 'i');
				expect(regex.test(tc.input)).toBe(tc.shouldMatch);
			});
		}
	});

	// ==========================================================================
	// HDR10 TESTS (from Profilarr)
	// ==========================================================================
	describe('HDR10', () => {
		it('should find HDR10 format', () => {
			expect(HDR10_FORMAT).toBeDefined();
		});

		// Profilarr test cases for HDR10
		const testCases = [
			{ input: 'HDR10', shouldMatch: true, desc: 'HDR10 exact' },
			{ input: 'Movie.2024.2160p.HDR10.HEVC-GROUP', shouldMatch: true, desc: 'in release name' },
			{ input: 'HDR10+', shouldMatch: false, desc: 'HDR10+ should NOT match' },
			{ input: 'HDR10Plus', shouldMatch: false, desc: 'HDR10Plus should NOT match' },
			{ input: 'HDR', shouldMatch: false, desc: 'plain HDR' },
			{ input: 'HLG HDR', shouldMatch: false, desc: 'HLG HDR' },
			{ input: 'SDR HDR', shouldMatch: false, desc: 'SDR HDR (conflicting)' }
		];

		for (const tc of testCases) {
			it(`${tc.shouldMatch ? 'matches' : 'does not match'}: ${tc.desc}`, () => {
				const condition = HDR10_FORMAT.conditions.find((c) => c.name === 'HDR10');
				if (!condition?.pattern) return;
				const regex = new RegExp(condition.pattern, 'i');
				expect(regex.test(tc.input)).toBe(tc.shouldMatch);
			});
		}
	});

	// ==========================================================================
	// GENERIC HDR TESTS (from Profilarr)
	// ==========================================================================
	describe('HDR (Generic)', () => {
		it('should find Generic HDR format', () => {
			expect(HDR_GENERIC_FORMAT).toBeDefined();
		});

		// Profilarr test cases for generic HDR
		const testCases = [
			{
				input:
					'Barbie (2023) 2160p UHD BluRay Hybrid REMUX HEVC DV HDR TrueHD Atmos 7.1 English-FraMeSToR',
				shouldMatch: true,
				desc: 'release with DV HDR'
			},
			{ input: 'HDR+', shouldMatch: true, desc: 'HDR+' },
			{ input: 'Movie.2024.2160p.HDR.HEVC-GROUP', shouldMatch: true, desc: 'HDR in release name' },
			{ input: 'HDR10', shouldMatch: false, desc: 'HDR10 should NOT match generic' },
			{ input: 'HDR10+', shouldMatch: false, desc: 'HDR10+ should NOT match generic' }
		];

		for (const tc of testCases) {
			it(`${tc.shouldMatch ? 'matches' : 'does not match'}: ${tc.desc}`, () => {
				const condition = HDR_GENERIC_FORMAT.conditions.find((c) => c.name === 'HDR');
				if (!condition?.pattern) return;
				const regex = new RegExp(condition.pattern, 'i');
				expect(regex.test(tc.input)).toBe(tc.shouldMatch);
			});
		}
	});

	// ==========================================================================
	// HLG TESTS
	// ==========================================================================
	describe('HLG', () => {
		it('should find HLG format', () => {
			expect(HLG_FORMAT).toBeDefined();
		});

		const testCases = [
			{ input: 'Movie.2024.2160p.HLG.HEVC-GROUP', shouldMatch: true, desc: 'HLG standard' },
			{
				input: 'Movie.2024.2160p.Broadcast.HLG.H265-GROUP',
				shouldMatch: true,
				desc: 'HLG broadcast'
			},
			{ input: 'Movie.2024.2160p.HDR.HEVC-GROUP', shouldMatch: false, desc: 'HDR only' },
			{ input: 'Movie.2024.2160p.HDR10.HEVC-GROUP', shouldMatch: false, desc: 'HDR10' }
		];

		for (const tc of testCases) {
			it(`${tc.shouldMatch ? 'matches' : 'does not match'}: ${tc.desc}`, () => {
				const condition = HLG_FORMAT.conditions.find((c) => c.name === 'HLG');
				if (!condition?.pattern) return;
				const regex = new RegExp(condition.pattern, 'i');
				expect(regex.test(tc.input)).toBe(tc.shouldMatch);
			});
		}
	});

	// ==========================================================================
	// PQ TESTS
	// ==========================================================================
	describe('PQ', () => {
		it('should find PQ format', () => {
			expect(PQ_FORMAT).toBeDefined();
		});

		const testCases = [
			{ input: 'Movie.2024.2160p.PQ.HEVC-GROUP', shouldMatch: true, desc: 'PQ standard' },
			{ input: 'Movie.2024.2160p.PQ10.HEVC-GROUP', shouldMatch: true, desc: 'PQ10' },
			{ input: 'Movie.2024.2160p.HDR.HEVC-GROUP', shouldMatch: false, desc: 'HDR only' }
		];

		for (const tc of testCases) {
			it(`${tc.shouldMatch ? 'matches' : 'does not match'}: ${tc.desc}`, () => {
				const condition = PQ_FORMAT.conditions.find((c) => c.name === 'PQ');
				if (!condition?.pattern) return;
				const regex = new RegExp(condition.pattern, 'i');
				expect(regex.test(tc.input)).toBe(tc.shouldMatch);
			});
		}
	});

	// ==========================================================================
	// SDR TESTS (from Profilarr)
	// ==========================================================================
	describe('SDR', () => {
		it('should find SDR format', () => {
			expect(SDR_FORMAT).toBeDefined();
		});

		// Profilarr test cases for SDR
		const testCases = [
			{
				input: 'Yojimbo.1961.REPACK.2160p.UHD.Blu-ray.Remux.SDR.HEVC.FLAC.1.0-CiNEPHiLES.mkv',
				shouldMatch: true,
				desc: 'explicit SDR label'
			},
			{
				input:
					'For a Few Dollars More aka Per qualche dollaro in più 1965 UHD BluRay 2160p DTS-HD MA 5.1 SDR HEVC REMUX-FraMeSToR',
				shouldMatch: true,
				desc: 'SDR in release name'
			},
			{
				input: 'Movie.2024.2160p.HDR.HEVC-GROUP',
				shouldMatch: false,
				desc: 'HDR is not SDR'
			},
			{
				input: 'Movie.2024.2160p.DV.HDR.HEVC-GROUP',
				shouldMatch: false,
				desc: 'DV HDR is not SDR'
			}
		];

		for (const tc of testCases) {
			it(`${tc.shouldMatch ? 'matches' : 'does not match'}: ${tc.desc}`, () => {
				const condition = SDR_FORMAT.conditions.find((c) => c.name === 'SDR');
				if (!condition?.pattern) return;
				const regex = new RegExp(condition.pattern, 'i');
				expect(regex.test(tc.input)).toBe(tc.shouldMatch);
			});
		}
	});

	// ==========================================================================
	// FORMAT REGISTRY TESTS
	// ==========================================================================
	describe('Format Registry', () => {
		it('should have all expected HDR format categories', () => {
			expect(DOLBY_VISION_FORMATS.length).toBe(2); // DV and DV without fallback
			expect(HDR10_FORMATS.length).toBe(3); // HDR10+, HDR10, HDR
			expect(OTHER_HDR_FORMATS.length).toBe(2); // HLG, PQ
			expect(MISSING_HDR_FORMATS.length).toBe(2); // HDR Missing, HDR10 Missing
		});

		it('should have unique format IDs', () => {
			const ids = ALL_HDR_FORMATS.map((f) => f.id);
			const uniqueIds = new Set(ids);
			expect(ids.length).toBe(uniqueIds.size);
		});

		it('should have all formats categorized as hdr', () => {
			for (const format of ALL_HDR_FORMATS) {
				expect(format.category).toBe('hdr');
			}
		});

		it('should have proper order in ALL_HDR_FORMATS (most specific first)', () => {
			// DV formats should come before HDR10 formats
			const dvIndex = ALL_HDR_FORMATS.findIndex((f) => f.id === 'hdr-dolby-vision');
			const hdr10Index = ALL_HDR_FORMATS.findIndex((f) => f.id === 'hdr-hdr10');
			expect(dvIndex).toBeLessThan(hdr10Index);

			// HDR10+ should come before HDR10
			const hdr10PlusIndex = ALL_HDR_FORMATS.findIndex((f) => f.id === 'hdr-hdr10plus');
			expect(hdr10PlusIndex).toBeLessThan(hdr10Index);
		});
	});

	// ==========================================================================
	// REAL RELEASE TESTS
	// ==========================================================================
	describe('Real Release Examples', () => {
		const realReleases = [
			{
				title: 'Oppenheimer.2023.2160p.UHD.BluRay.REMUX.DV.HDR.TrueHD.Atmos.7.1-FGT',
				expectedFormats: ['hdr-dolby-vision'],
				desc: 'UHD BluRay with DV + HDR'
			},
			{
				title: 'Dune.Part.Two.2024.2160p.AMZN.WEB-DL.DDP5.1.Atmos.DV.H.265-FLUX',
				expectedFormats: ['hdr-dolby-vision-no-fallback'],
				desc: 'WEB-DL with DV only (no fallback)'
			},
			{
				title: 'The.Matrix.1999.2160p.UHD.BluRay.REMUX.HDR10+.TrueHD.7.1-FGT',
				expectedFormats: ['hdr-hdr10plus'],
				desc: 'UHD BluRay with HDR10+'
			},
			{
				title: 'Blade.Runner.2049.2017.2160p.UHD.BluRay.REMUX.HDR.DTS-HD.MA.7.1-FGT',
				expectedFormats: ['hdr-generic'], // Just "HDR" without version number
				desc: 'UHD BluRay with generic HDR'
			},
			{
				title: 'The.Godfather.1972.2160p.UHD.BluRay.REMUX.SDR.DTS-HD.MA.5.1-FGT',
				expectedFormats: ['hdr-sdr'],
				desc: 'UHD BluRay SDR transfer'
			}
		];

		for (const release of realReleases) {
			it(`correctly identifies: ${release.desc}`, () => {
				// Check that the expected format matches
				for (const expectedId of release.expectedFormats) {
					const format = ALL_HDR_FORMATS.find((f) => f.id === expectedId);
					expect(format).toBeDefined();

					if (format) {
						// Check the primary pattern matches
						const primaryCondition = format.conditions.find((c) => c.required && !c.negate);
						if (primaryCondition?.pattern) {
							const regex = new RegExp(primaryCondition.pattern, 'i');
							expect(regex.test(release.title)).toBe(true);
						}
					}
				}
			});
		}
	});
});
