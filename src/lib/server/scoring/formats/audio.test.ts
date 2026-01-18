/**
 * Audio Format Tests
 *
 * Tests audio format matching based on Profilarr test cases.
 * Uses regex patterns from the Profilarr database for validation.
 */

import { describe, it, expect } from 'vitest';
import {
	LOSSLESS_AUDIO_FORMATS,
	ATMOS_FORMATS,
	HQ_LOSSY_AUDIO_FORMATS,
	STANDARD_AUDIO_FORMATS,
	ALL_AUDIO_FORMATS
} from './audio.js';

describe('Audio Format Matching', () => {
	// ==========================================================================
	// TRUEHD TESTS
	// ==========================================================================
	describe('TrueHD', () => {
		const truehd = LOSSLESS_AUDIO_FORMATS.find((f) => f.id === 'audio-truehd');

		it('should find TrueHD format', () => {
			expect(truehd).toBeDefined();
		});

		const truehdTestCases = [
			{
				input: 'Movie.2024.2160p.UHD.BluRay.REMUX.HEVC.TrueHD.7.1.Atmos-GROUP',
				shouldMatch: true,
				desc: 'standard TrueHD naming'
			},
			{
				input: 'Movie.2024.2160p.BluRay.TrueHD.Atmos.7.1-GROUP',
				shouldMatch: true,
				desc: 'TrueHD with Atmos'
			},
			{
				input: 'Movie.2024.1080p.BluRay.True-HD.5.1-GROUP',
				shouldMatch: true,
				desc: 'True-HD hyphenated'
			},
			{
				input: 'Movie.2024.1080p.BluRay.True.HD.5.1-GROUP',
				shouldMatch: true,
				desc: 'True.HD dot-separated'
			},
			{
				input: 'Movie.2024.1080p.BluRay.DTS-HD.MA.5.1-GROUP',
				shouldMatch: false,
				desc: 'DTS-HD MA should not match TrueHD'
			},
			{
				input: 'Movie.2024.1080p.WEB-DL.DD+.5.1-GROUP',
				shouldMatch: false,
				desc: 'DD+ should not match TrueHD'
			}
		];

		for (const tc of truehdTestCases) {
			it(`${tc.shouldMatch ? 'matches' : 'does not match'}: ${tc.desc}`, () => {
				if (!truehd) return;
				const pattern = truehd.conditions[0].pattern;
				if (!pattern) return;
				const regex = new RegExp(pattern, 'i');
				expect(regex.test(tc.input)).toBe(tc.shouldMatch);
			});
		}
	});

	// ==========================================================================
	// ATMOS TESTS (from Profilarr)
	// ==========================================================================
	describe('Atmos', () => {
		const atmos = ATMOS_FORMATS.find((f) => f.id === 'audio-atmos');
		const atmosMissing = ATMOS_FORMATS.find((f) => f.id === 'audio-atmos-missing');

		it('should find Atmos format', () => {
			expect(atmos).toBeDefined();
		});

		it('should find Atmos (Missing) format for BTN naming', () => {
			expect(atmosMissing).toBeDefined();
		});

		// Standard Atmos word test cases
		const atmosWordTestCases = [
			{
				input: 'The.Last.of.Us.S01.2160p.UHD.BluRay.Remux.TrueHDA7.1.H.265-PmP',
				shouldMatch: false, // BTN Atmos naming - handled by Atmos Missing
				desc: 'BTN TrueHDA naming (should NOT match Atmos word)'
			},
			{
				input: 'The.Last.of.Us.S01.UHD.BluRay.2160p.TrueHD.Atmos.7.1.DV.HEVC.REMUX-FraMeSToR',
				shouldMatch: true,
				desc: 'standard Atmos naming'
			},
			{
				input: 'The Last of Us S01 2160p MAX WEB-DL DDP 5.1 Atmos DV HDR H.265-FLUX',
				shouldMatch: true,
				desc: 'Atmos with spaces'
			}
		];

		for (const tc of atmosWordTestCases) {
			it(`${tc.shouldMatch ? 'matches' : 'does not match'}: ${tc.desc}`, () => {
				expect(atmos).toBeDefined();
				if (!atmos) return;
				const pattern = atmos.conditions.find((c) => c.name === 'Atmos')?.pattern;
				expect(pattern).toBeDefined();
				if (!pattern) return;
				const regex = new RegExp(pattern, 'i');
				expect(regex.test(tc.input)).toBe(tc.shouldMatch);
			});
		}

		// DDPA (DD+ Atmos) test cases
		const ddpaTestCases = [
			{
				input: 'The.Last.of.Us.S01.DV.HDR.2160p.MAX.WEB-DL.DDPA5.1.H.265-FLUX',
				shouldMatch: true,
				desc: 'DDPA5.1 naming for Atmos'
			},
			{
				input: 'Movie.2024.WEB-DL.DDPA.5.1-GROUP',
				shouldMatch: true,
				desc: 'DDPA with space before channel'
			}
		];

		for (const tc of ddpaTestCases) {
			it(`DDPA ${tc.shouldMatch ? 'matches' : 'does not match'}: ${tc.desc}`, () => {
				expect(atmos).toBeDefined();
				if (!atmos) return;
				const pattern = atmos.conditions.find((c) => c.name === 'DDPA (DD+ Atmos)')?.pattern;
				expect(pattern).toBeDefined();
				if (!pattern) return;
				const regex = new RegExp(pattern, 'i');
				expect(regex.test(tc.input)).toBe(tc.shouldMatch);
			});
		}

		// BTN Atmos (Atmos Missing) test cases
		const btnAtmosTestCases = [
			{
				input: 'The.Last.of.Us.S01.2160p.UHD.BluRay.Remux.TrueHDA7.1.H.265-PmP',
				shouldMatch: true,
				desc: 'BTN TrueHDA7.1 naming'
			},
			{
				input: 'Loki.S01.2160p.UHD.BluRay.Remux.TrueHDA.7.1.H.265-SiCFoI',
				shouldMatch: true,
				desc: 'BTN TrueHDA.7.1 with space'
			},
			{
				input: 'The.Last.of.Us.S01.UHD.BluRay.2160p.TrueHD.Atmos.7.1.DV.HEVC.REMUX-FraMeSToR',
				shouldMatch: false,
				desc: 'standard naming should NOT match BTN pattern'
			},
			{
				input: 'The Last of Us S01 2160p MAX WEB-DL DDP 5.1 Atmos DV HDR H.265-FLUX',
				shouldMatch: false,
				desc: 'WEB-DL Atmos should NOT match BTN pattern'
			}
		];

		for (const tc of btnAtmosTestCases) {
			it(`BTN Atmos ${tc.shouldMatch ? 'matches' : 'does not match'}: ${tc.desc}`, () => {
				expect(atmosMissing).toBeDefined();
				if (!atmosMissing) return;
				const pattern = atmosMissing.conditions.find((c) => c.name === 'BTN Atmos Convention')?.pattern;
				expect(pattern).toBeDefined();
				if (!pattern) return;
				const regex = new RegExp(pattern, 'i');
				expect(regex.test(tc.input)).toBe(tc.shouldMatch);
			});
		}
	});

	// ==========================================================================
	// DTS-HD MA TESTS
	// ==========================================================================
	describe('DTS-HD MA', () => {
		const dtshdma = LOSSLESS_AUDIO_FORMATS.find((f) => f.id === 'audio-dts-hdma');

		it('should find DTS-HD MA format', () => {
			expect(dtshdma).toBeDefined();
		});

		const testCases = [
			{
				input: 'Movie.2024.1080p.BluRay.DTS-HD.MA.5.1-GROUP',
				shouldMatch: true,
				desc: 'DTS-HD MA'
			},
			{ input: 'Movie.2024.1080p.BluRay.DTS-HDMA.5.1-GROUP', shouldMatch: true, desc: 'DTS-HDMA' },
			{ input: 'Movie.2024.1080p.BluRay.DTSMA.5.1-GROUP', shouldMatch: true, desc: 'DTSMA' },
			{ input: 'Movie.2024.1080p.BluRay.DTS.MA.5.1-GROUP', shouldMatch: true, desc: 'DTS MA' },
			{
				input: 'Movie.2024.1080p.BluRay.DTS-HD-MA-5.1-GROUP',
				shouldMatch: true,
				desc: 'DTS-HD-MA'
			},
			{
				input: 'Movie.2024.1080p.BluRay.DTS5.1-GROUP',
				shouldMatch: false,
				desc: 'plain DTS should NOT match'
			},
			{
				input: 'Movie.2024.1080p.BluRay.DTS-X.7.1-GROUP',
				shouldMatch: false,
				desc: 'DTS:X should NOT match MA'
			}
		];

		for (const tc of testCases) {
			it(`${tc.shouldMatch ? 'matches' : 'does not match'}: ${tc.desc}`, () => {
				if (!dtshdma) return;
				const pattern = dtshdma.conditions.find((c) => c.name === 'DTS-HD MA')?.pattern;
				if (!pattern) return;
				const regex = new RegExp(pattern, 'i');
				expect(regex.test(tc.input)).toBe(tc.shouldMatch);
			});
		}
	});

	// ==========================================================================
	// DTS:X TESTS (from Profilarr)
	// ==========================================================================
	describe('DTS:X', () => {
		const dtsx = LOSSLESS_AUDIO_FORMATS.find((f) => f.id === 'audio-dts-x');

		it('should find DTS:X format', () => {
			expect(dtsx).toBeDefined();
		});

		// Profilarr test cases
		const testCases = [
			{
				input: '2 Fast 2 Furious (2003) 2160p MA WEB-DL H265 HDR DTS:X 7.1 English-FLUX',
				shouldMatch: true,
				desc: 'DTS:X with colon'
			},
			{
				input: '2.Fast.2.Furious.2003.2160p.MA.WEB-DL.DTS-X.7.1.H.265-FLUX.mkv',
				shouldMatch: true,
				desc: 'DTS-X with hyphen'
			},
			{
				input: 'Movie.2024.2160p.BluRay.DTS X 7.1-GROUP',
				shouldMatch: true,
				desc: 'DTS X with space'
			},
			{
				input: 'Movie.2024.1080p.BluRay.DTS-HD.MA.5.1-GROUP',
				shouldMatch: false,
				desc: 'DTS-HD MA should NOT match DTS:X'
			}
		];

		for (const tc of testCases) {
			it(`${tc.shouldMatch ? 'matches' : 'does not match'}: ${tc.desc}`, () => {
				expect(dtsx).toBeDefined();
				if (!dtsx) return;
				const pattern = dtsx.conditions.find((c) => c.name === 'DTS-X')?.pattern;
				expect(pattern).toBeDefined();
				if (!pattern) return;
				const regex = new RegExp(pattern, 'i');
				expect(regex.test(tc.input)).toBe(tc.shouldMatch);
			});
		}
	});

	// ==========================================================================
	// DD+ / EAC3 TESTS
	// ==========================================================================
	describe('DD+ (Dolby Digital Plus)', () => {
		const ddplus = STANDARD_AUDIO_FORMATS.find((f) => f.id === 'audio-ddplus');

		it('should find DD+ format', () => {
			expect(ddplus).toBeDefined();
		});

		const testCases = [
			{ input: 'Movie.2024.1080p.WEB-DL.DD+.5.1-GROUP', shouldMatch: true, desc: 'DD+' },
			{ input: 'Movie.2024.1080p.WEB-DL.DDP.5.1-GROUP', shouldMatch: true, desc: 'DDP' },
			{ input: 'Movie.2024.1080p.WEB-DL.EAC3.5.1-GROUP', shouldMatch: true, desc: 'EAC3' },
			{ input: 'Movie.2024.1080p.WEB-DL.E-AC3.5.1-GROUP', shouldMatch: true, desc: 'E-AC3' },
			{
				input: 'Movie.2024.1080p.WEB-DL.DDP5.1.Atmos-GROUP',
				shouldMatch: true,
				desc: 'DDP with Atmos'
			},
			{
				input: 'Movie.2024.1080p.WEB-DL.DDPA5.1-GROUP',
				shouldMatch: true,
				desc: 'DDPA (DDP Atmos)'
			},
			{
				input: 'Movie.2024.1080p.BluRay.DD.5.1-GROUP',
				shouldMatch: false,
				desc: 'plain DD should NOT match DD+'
			},
			{
				input: 'Movie.2024.1080p.BluRay.AC3.5.1-GROUP',
				shouldMatch: false,
				desc: 'AC3 should NOT match DD+'
			}
		];

		for (const tc of testCases) {
			it(`${tc.shouldMatch ? 'matches' : 'does not match'}: ${tc.desc}`, () => {
				expect(ddplus).toBeDefined();
				if (!ddplus) return;
				const pattern = ddplus.conditions.find((c) => c.name === 'DD+/EAC3')?.pattern;
				expect(pattern).toBeDefined();
				if (!pattern) return;
				const regex = new RegExp(pattern, 'i');
				expect(regex.test(tc.input)).toBe(tc.shouldMatch);
			});
		}
	});

	// ==========================================================================
	// FLAC TESTS
	// ==========================================================================
	describe('FLAC', () => {
		const flac = LOSSLESS_AUDIO_FORMATS.find((f) => f.id === 'audio-flac');

		it('should find FLAC format', () => {
			expect(flac).toBeDefined();
		});

		const testCases = [
			{ input: 'Movie.2024.1080p.BluRay.FLAC.2.0-GROUP', shouldMatch: true, desc: 'FLAC stereo' },
			{ input: 'Movie.2024.1080p.BluRay.FLAC-2.0-GROUP', shouldMatch: true, desc: 'FLAC-2.0' },
			{
				input: 'Concert.2024.1080p.BluRay.FLAC.5.1-GROUP',
				shouldMatch: true,
				desc: 'FLAC multichannel'
			},
			{
				input: 'Movie.2024.1080p.WEB-DL.AAC.2.0-GROUP',
				shouldMatch: false,
				desc: 'AAC should NOT match FLAC'
			}
		];

		for (const tc of testCases) {
			it(`${tc.shouldMatch ? 'matches' : 'does not match'}: ${tc.desc}`, () => {
				if (!flac) return;
				const pattern = flac.conditions.find((c) => c.name === 'FLAC')?.pattern;
				if (!pattern) return;
				const regex = new RegExp(pattern, 'i');
				expect(regex.test(tc.input)).toBe(tc.shouldMatch);
			});
		}
	});

	// ==========================================================================
	// OPUS TESTS
	// ==========================================================================
	describe('Opus', () => {
		const opus = HQ_LOSSY_AUDIO_FORMATS.find((f) => f.id === 'audio-opus');

		it('should find Opus format', () => {
			expect(opus).toBeDefined();
		});

		const testCases = [
			{ input: 'Movie.2024.1080p.WEB-DL.Opus.5.1-GROUP', shouldMatch: true, desc: 'Opus standard' },
			{ input: 'Movie.2024.720p.WEB-DL.OPUS.2.0-GROUP', shouldMatch: true, desc: 'OPUS uppercase' },
			{
				input: 'Movie.2024.1080p.WEB-DL.AAC.2.0-GROUP',
				shouldMatch: false,
				desc: 'AAC should NOT match Opus'
			}
		];

		for (const tc of testCases) {
			it(`${tc.shouldMatch ? 'matches' : 'does not match'}: ${tc.desc}`, () => {
				if (!opus) return;
				const pattern = opus.conditions.find((c) => c.name === 'Opus')?.pattern;
				if (!pattern) return;
				const regex = new RegExp(pattern, 'i');
				expect(regex.test(tc.input)).toBe(tc.shouldMatch);
			});
		}
	});

	// ==========================================================================
	// PCM TESTS
	// ==========================================================================
	describe('PCM', () => {
		const pcm = LOSSLESS_AUDIO_FORMATS.find((f) => f.id === 'audio-pcm');

		it('should find PCM format', () => {
			expect(pcm).toBeDefined();
		});

		const testCases = [
			{ input: 'Movie.2024.1080p.BluRay.PCM.2.0-GROUP', shouldMatch: true, desc: 'PCM' },
			{ input: 'Movie.2024.1080p.BluRay.LPCM.5.1-GROUP', shouldMatch: true, desc: 'LPCM' },
			{
				input: 'Movie.2024.1080p.BluRay.FLAC.2.0-GROUP',
				shouldMatch: false,
				desc: 'FLAC should NOT match PCM'
			}
		];

		for (const tc of testCases) {
			it(`${tc.shouldMatch ? 'matches' : 'does not match'}: ${tc.desc}`, () => {
				if (!pcm) return;
				const pattern = pcm.conditions.find((c) => c.name === 'PCM')?.pattern;
				if (!pattern) return;
				const regex = new RegExp(pattern, 'i');
				expect(regex.test(tc.input)).toBe(tc.shouldMatch);
			});
		}
	});

	// ==========================================================================
	// DD / AC3 TESTS
	// ==========================================================================
	describe('DD (Dolby Digital)', () => {
		const dd = STANDARD_AUDIO_FORMATS.find((f) => f.id === 'audio-dd');

		it('should find DD format', () => {
			expect(dd).toBeDefined();
		});

		const testCases = [
			{ input: 'Movie.2024.1080p.BluRay.DD.5.1-GROUP', shouldMatch: true, desc: 'DD' },
			{ input: 'Movie.2024.1080p.BluRay.AC3.5.1-GROUP', shouldMatch: true, desc: 'AC3' },
			{ input: 'Movie.2024.1080p.BluRay.AC-3.5.1-GROUP', shouldMatch: true, desc: 'AC-3' },
			{
				input: 'Movie.2024.1080p.BluRay.DD+.5.1-GROUP',
				shouldMatch: false,
				desc: 'DD+ should NOT match plain DD'
			},
			{
				input: 'Movie.2024.1080p.WEB-DL.EAC3.5.1-GROUP',
				shouldMatch: false,
				desc: 'EAC3 should NOT match plain DD'
			}
		];

		for (const tc of testCases) {
			it(`${tc.shouldMatch ? 'matches' : 'does not match'}: ${tc.desc}`, () => {
				if (!dd) return;
				const pattern = dd.conditions.find((c) => c.name === 'DD/AC3')?.pattern;
				if (!pattern) return;
				const regex = new RegExp(pattern, 'i');
				expect(regex.test(tc.input)).toBe(tc.shouldMatch);
			});
		}
	});

	// ==========================================================================
	// SCORE HIERARCHY TESTS
	// Note: Default scores are 0, actual scores come from profiles
	// These tests verify format presence and structure
	// ==========================================================================
	describe('Score Hierarchy', () => {
		it('should have lossless formats with Audio tag', () => {
			for (const format of LOSSLESS_AUDIO_FORMATS) {
				expect(format.tags).toContain('Audio');
				expect(format.tags).toContain('Lossless');
			}
		});

		it('should have Atmos formats as stackable modifiers', () => {
			const atmosFormat = ATMOS_FORMATS.find((f) => f.id === 'audio-atmos');
			expect(atmosFormat).toBeDefined();
			expect(atmosFormat?.category).toBe('audio');
		});

		it('should have TrueHD format', () => {
			const truehd = LOSSLESS_AUDIO_FORMATS.find((f) => f.id === 'audio-truehd');
			expect(truehd).toBeDefined();
		});

		it('should have DTS:X format for object-based audio', () => {
			const dtsx = LOSSLESS_AUDIO_FORMATS.find((f) => f.id === 'audio-dts-x');
			expect(dtsx).toBeDefined();
		});
	});

	// ==========================================================================
	// FORMAT COUNT TEST
	// ==========================================================================
	describe('Format Registry', () => {
		it('should have all expected audio formats', () => {
			// Check we have formats in each category
			expect(LOSSLESS_AUDIO_FORMATS.length).toBeGreaterThan(0);
			expect(ATMOS_FORMATS.length).toBeGreaterThan(0);
			expect(HQ_LOSSY_AUDIO_FORMATS.length).toBeGreaterThan(0);
			expect(STANDARD_AUDIO_FORMATS.length).toBeGreaterThan(0);
		});

		it('should have unique format IDs', () => {
			const ids = ALL_AUDIO_FORMATS.map((f) => f.id);
			const uniqueIds = new Set(ids);
			expect(ids.length).toBe(uniqueIds.size);
		});

		it('should have all formats categorized as audio', () => {
			for (const format of ALL_AUDIO_FORMATS) {
				expect(format.category).toBe('audio');
			}
		});
	});
});
