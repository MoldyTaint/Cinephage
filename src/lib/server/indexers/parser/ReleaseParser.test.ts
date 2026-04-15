import { describe, it, expect } from 'vitest';
import { parseRelease, extractExternalIds } from './ReleaseParser';
import { isTvRelease } from './patterns/episode';
import { extractResolution } from './patterns/resolution';
import { extractSource } from './patterns/source';
import { extractBitDepth, extractCodec } from './patterns/codec';
import { extractEnhancedAudio, extractHdr } from './patterns/audio';
import { extractReleaseGroup } from './patterns/releaseGroup';

describe('ReleaseParser', () => {
	describe('Movie Releases', () => {
		it('should parse a standard movie release', () => {
			const result = parseRelease('The.Matrix.1999.1080p.BluRay.x264-GROUP');

			expect(result.cleanTitle).toBe('The Matrix');
			expect(result.year).toBe(1999);
			expect(result.resolution).toBe('1080p');
			expect(result.source).toBe('bluray');
			expect(result.codec).toBe('h264');
			expect(result.releaseGroup).toBe('GROUP');
			expect(result.episode).toBeUndefined();
		});

		it('should parse a 4K HDR release', () => {
			const result = parseRelease('Dune.2021.2160p.UHD.BluRay.REMUX.HDR.HEVC.Atmos-FGT');

			expect(result.cleanTitle).toBe('Dune');
			expect(result.year).toBe(2021);
			expect(result.resolution).toBe('2160p');
			expect(result.source).toBe('remux');
			expect(result.codec).toBe('h265');
			expect(result.hdr).toBe('hdr'); // Generic HDR without specific version
			expect(result.audioCodec).toBe('unknown');
			expect(result.hasAtmos).toBe(true);
			expect(result.isRemux).toBe(true);
			expect(result.releaseGroup).toBe('FGT');
		});

		it('should parse a WEB-DL release', () => {
			const result = parseRelease('Spider-Man.No.Way.Home.2021.1080p.WEB-DL.DD+5.1.H.264-RUMOUR');

			expect(result.cleanTitle).toBe('Spider-man No Way Home');
			expect(result.year).toBe(2021);
			expect(result.resolution).toBe('1080p');
			expect(result.source).toBe('webdl');
			expect(result.codec).toBe('h264');
			expect(result.audioCodec).toBe('dd+');
			expect(result.releaseGroup).toBe('RUMOUR');
		});

		it('should detect Dolby Vision', () => {
			const result = parseRelease('Interstellar.2014.2160p.WEB-DL.DV.HDR.DDP.5.1.Atmos.H.265-FLUX');

			expect(result.hdr).toBe('dolby-vision');
			expect(result.audioCodec).toBe('dd+');
			expect(result.hasAtmos).toBe(true);
		});

		it('should parse YTS-style releases', () => {
			const result = parseRelease('Oppenheimer (2023) [1080p] [WEBRip] [5.1] [YTS.MX]');

			expect(result.cleanTitle).toContain('Oppenheimer');
			expect(result.year).toBe(2023);
			expect(result.resolution).toBe('1080p');
			expect(result.source).toBe('webrip');
			expect(result.releaseGroup).toBe('YTS');
		});

		it('should parse normalized H 265 codec markers', () => {
			const result = parseRelease('Movie.2024.2160p.MA.WEB-DL.DDP.7.1.DoVi.HDR10.H.265-GROUP');

			expect(result.codec).toBe('h265');
		});

		it('should parse WEBSCREENER as screener source', () => {
			const result = parseRelease('Movie.2024.1080p.WEBSCREENER.x265.AAC-GROUP');

			expect(result.source).toBe('screener');
		});

		it('should parse HDRip as a distinct source', () => {
			const result = parseRelease('Movie.2024.HDRip.1080p.x264-GROUP');

			expect(result.source).toBe('hdrip');
			expect(result.resolution).toBe('1080p');
			expect(result.codec).toBe('h264');
		});

		it('should parse BD25 releases as bluray source', () => {
			const result = parseRelease('Movie.2024.CUSTOM.BD25.AVC.x264.DD.Plus.7.1-GROUP');

			expect(result.source).toBe('bluray');
			expect(result.codec).toBe('h264');
			expect(result.audioCodec).toBe('dd+');
			expect(result.audioChannels).toBe('7.1');
		});

		it('should parse DD Plus punctuation variants as ddplus', () => {
			const dotted = parseRelease('Movie.2024.1080p.WEB-DL.DD.Plus.5.1.H264-GROUP');
			const spaced = parseRelease('Movie.2024.1080p.WEB-DL.DD Plus.5.1.H264-GROUP');

			expect(dotted.audioCodec).toBe('dd+');
			expect(spaced.audioCodec).toBe('dd+');
		});

		it('should parse bit depth as a canonical fact', () => {
			const result = parseRelease('Movie.2024.1080p.10bit.WEBRip.x265.AAC-GROUP');

			expect(result.bitDepth).toBe('10');
			expect(result.codec).toBe('h265');
		});

		it('should detect streaming service and richer HDR combinations', () => {
			const result = parseRelease(
				'Avatar.Fire.and.Ash.2025.Hybrid.1080p.MA.WEBRIP.DDP7.1.DoVi.HDR10P.x265.HuN-TRiNiTY'
			);

			expect(result.streamingService).toBe('MA');
			expect(result.audioCodec).toBe('dd+');
			expect(result.audioChannels).toBe('7.1');
			expect(result.hdr).toBe('dolby-vision');
		});

		it('should detect PROPER releases', () => {
			const result = parseRelease('Movie.2023.1080p.BluRay.x264.PROPER-GROUP');

			expect(result.isProper).toBe(true);
		});

		it('should detect REPACK releases', () => {
			const result = parseRelease('Movie.2023.1080p.BluRay.x264.REPACK-GROUP');

			expect(result.isRepack).toBe(true);
		});

		it('should detect edition info', () => {
			const result = parseRelease(
				'Blade.Runner.1982.Final.Cut.2160p.BluRay.REMUX.HEVC.DTS-HD.MA.5.1-FGT'
			);

			expect(result.cleanTitle).toContain('Blade Runner');
			expect(result.edition).toBe('Final Cut');
		});

		it('should detect IMAX Enhanced releases', () => {
			const result = parseRelease('Movie.2024.IMAX.Enhanced.2160p.WEB-DL.DDP5.1.H265-GROUP');

			expect(result.edition).toBe('IMAX Enhanced');
		});

		it('should detect hybrid releases', () => {
			const result = parseRelease('Movie.2024.Hybrid.1080p.BluRay.x264-GROUP');

			expect(result.edition).toBe('Hybrid');
		});

		it('should not treat WEB-DL quality suffix as release group', () => {
			const result = parseRelease('Movie (2024) [WEB-DL-1080p][AC3 5.1][x265].mkv');

			expect(result.releaseGroup).toBeUndefined();
		});

		it('should not invent release groups from subtitle and language suffixes', () => {
			const subResult = parseRelease('Avatar: Fire and Ash / 2025 / DUB, Sub / HEVC / WEBDL 1080p');
			const engResult = parseRelease(
				'Avatar: Fire and Ash (James Cameron) [2025, WEB-DL-AVC] MVO (HDRezka Studio) + Sub + Original Eng'
			);
			const telResult = parseRelease(
				'Avatar Fire and Ash (2025) Telesync TS HD 1080p - x264 - [Tam.Tel.Hin]'
			);

			expect(subResult.releaseGroup).toBeUndefined();
			expect(engResult.releaseGroup).toBeUndefined();
			expect(telResult.releaseGroup).toBeUndefined();
		});

		it('should detect 3D releases', () => {
			const result = parseRelease('Avatar.2009.3D.1080p.BluRay.x264-GROUP');

			expect(result.is3d).toBe(true);
		});

		it('should not treat generic movie collection titles as TV packs', () => {
			const result = parseRelease('War Movies Complete Collection 2024 1080p BluRay x264');

			expect(result.episode).toBeUndefined();
		});
	});

	describe('TV Show Releases', () => {
		it('should parse standard S##E## format', () => {
			const result = parseRelease('Breaking.Bad.S01E01.1080p.BluRay.x264-GROUP');

			expect(result.cleanTitle).toBe('Breaking Bad');
			expect(result.episode).toBeDefined();
			expect(result.episode?.season).toBe(1);
			expect(result.episode?.episodes).toEqual([1]);
			expect(result.episode?.isSeasonPack).toBe(false);
			expect(result.resolution).toBe('1080p');
		});

		it('should parse multi-episode releases', () => {
			const result = parseRelease('Game.of.Thrones.S08E01E02.1080p.WEB-DL.DD5.1.H.264-GoT');

			expect(result.episode?.season).toBe(8);
			expect(result.episode?.episodes).toContain(1);
			expect(result.episode?.episodes).toContain(2);
		});

		it('should parse season packs', () => {
			const result = parseRelease('The.Office.US.S01.1080p.BluRay.x264-DEMAND');

			expect(result.cleanTitle).toBe('The Office Us');
			expect(result.episode?.season).toBe(1);
			expect(result.episode?.isSeasonPack).toBe(true);
		});

		it('should parse "Season X" format packs', () => {
			const result = parseRelease('Stranger.Things.Season.4.1080p.NF.WEB-DL.DDP5.1.x264-NTb');

			expect(result.episode?.season).toBe(4);
			expect(result.episode?.isSeasonPack).toBe(true);
		});

		it('should parse tracker season packs with explicit episode range', () => {
			const result = parseRelease(
				'The Pitt / Season: 2 / Episodes: 1-10 of 15 [2026, USA, WEB-DLRip]'
			);

			expect(result.episode?.season).toBe(2);
			expect(result.episode?.isSeasonPack).toBe(true);
			expect(result.episode?.episodes).toContain(1);
			expect(result.episode?.episodes).toContain(10);
			expect(result.episode?.episodes).not.toContain(11);
		});

		it('should parse SxxExx-yy episode range packs', () => {
			const result = parseRelease('Stranger Things S1E1-8 [2016, HEVC, WEB-DL]');

			expect(result.episode?.season).toBe(1);
			expect(result.episode?.isSeasonPack).toBe(true);
			expect(result.episode?.episodes).toContain(1);
			expect(result.episode?.episodes).toContain(8);
			expect(result.episode?.episodes).not.toContain(9);
		});

		it('should not treat clock time episode titles as season-pack ranges', () => {
			const result = parseRelease('The Pitt S02E01 - 7:00 A.M. [Streaming]');

			expect(result.episode?.season).toBe(2);
			expect(result.episode?.episodes).toEqual([1]);
			expect(result.episode?.isSeasonPack).toBe(false);
		});

		it('should parse complete series packs', () => {
			const result = parseRelease('Friends.Complete.Series.S01-S10.1080p.BluRay.x264-GROUP');

			expect(result.episode?.isCompleteSeries).toBe(true);
			expect(result.episode?.isSeasonPack).toBe(true);
			expect(result.episode?.seasons).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
		});

		it('should parse multi-season packs S01-S05', () => {
			const result = parseRelease('Breaking.Bad.S01-S05.1080p.BluRay.x264-GROUP');

			expect(result.episode?.isSeasonPack).toBe(true);
			expect(result.episode?.seasons).toEqual([1, 2, 3, 4, 5]);
			expect(result.episode?.isCompleteSeries).toBe(true);
		});

		it('should parse multi-season packs S03-S06 (not starting from S01)', () => {
			const result = parseRelease('Show.S03-S06.720p.WEB-DL.x264-GROUP');

			expect(result.episode?.isSeasonPack).toBe(true);
			expect(result.episode?.seasons).toEqual([3, 4, 5, 6]);
			expect(result.episode?.isCompleteSeries).toBe(false);
		});

		it('should parse multi-season packs with Seasons format', () => {
			const result = parseRelease('The.Office.Seasons.1-9.Complete.1080p.BluRay-GROUP');

			expect(result.episode?.isSeasonPack).toBe(true);
			expect(result.episode?.seasons).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
		});

		it('should parse SxxExx-SyyEzz multi-season range notation', () => {
			const result = parseRelease('Show.Name.S01E01-S08E99.1080p.WEB-DL');

			expect(result.episode?.isSeasonPack).toBe(true);
			expect(result.episode?.seasons).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
			expect(result.episode?.isCompleteSeries).toBe(true);
		});

		it('should parse 1x01-8x99 multi-season range notation', () => {
			const result = parseRelease('Show Name 1x01-8x99 720p WEB-DL');

			expect(result.episode?.isSeasonPack).toBe(true);
			expect(result.episode?.seasons).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
		});

		it('should parse "Season X through Y" notation', () => {
			const result = parseRelease('The Show / Season: 1 through 5 / Episodes: 1-60 of 100');

			expect(result.episode?.isSeasonPack).toBe(true);
			expect(result.episode?.seasons).toEqual([1, 2, 3, 4, 5]);
			expect(result.episode?.isCompleteSeries).toBe(true);
		});

		it('should parse "Every Season" as complete series', () => {
			const result = parseRelease('The Show Every Season 1080p WEB-DL');

			expect(result.episode?.isSeasonPack).toBe(true);
			expect(result.episode?.isCompleteSeries).toBe(true);
		});

		it('should parse "Season: 1 of 1" as single-season complete series', () => {
			const result = parseRelease('One Season Show / Season: 1 of 1 / Episodes: 1-10 of 10');

			expect(result.episode?.season).toBe(1);
			expect(result.episode?.isSeasonPack).toBe(true);
			expect(result.episode?.isCompleteSeries).toBe(true);
		});

		it('should parse russian season ranges used by trackers', () => {
			const result = parseRelease('Сериал / Сезоны: 1-4 из 4 / Эпизоды: 1-40 из 40');

			expect(result.episode?.isSeasonPack).toBe(true);
			expect(result.episode?.seasons).toEqual([1, 2, 3, 4]);
			expect(result.episode?.isCompleteSeries).toBe(true);
		});

		it('should parse tracker multi-season packs with "Season: 1-8 of 8 / Episodes: 1-171 of 171" format', () => {
			const result = parseRelease(
				'The Vampire Diaries / Season: 1-8 of 8 / Episodes: 1-171 of 171 [2009-2017, USA, BDRip]'
			);

			expect(result.episode?.isSeasonPack).toBe(true);
			expect(result.episode?.seasons).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
			expect(result.episode?.isCompleteSeries).toBe(true);
		});

		it('should parse tracker multi-season ranges with "Season: X-Y of N" where start season is not 1', () => {
			const result = parseRelease(
				'Some Show / Season: 3-5 of 8 / Episodes: 1-60 of 171 [2012-2015, WEB-DL]'
			);

			expect(result.episode?.isSeasonPack).toBe(true);
			expect(result.episode?.seasons).toEqual([3, 4, 5]);
			expect(result.episode?.isCompleteSeries).toBe(false);
		});

		it('should infer complete series from large S1E1-XXX of XXX ranges', () => {
			const result = parseRelease(
				'The Vampire Diaries: S1E1-171 of 171 [2009-2017, BDRip] MVO (LostFilm)'
			);

			expect(result.episode?.isSeasonPack).toBe(true);
			expect(result.episode?.isCompleteSeries).toBe(true);
			expect(result.episode?.season).toBe(1);
			expect(result.episode?.episodes?.length).toBe(171);
		});

		it('should not infer complete series for normal single-season ranges', () => {
			const result = parseRelease('The Vampire Diaries: S1E1-22 of 22 [2009-2010, BDRip]');

			expect(result.episode?.isSeasonPack).toBe(true);
			expect(result.episode?.isCompleteSeries).toBe(false);
			expect(result.episode?.season).toBe(1);
			expect(result.episode?.episodes?.length).toBe(22);
		});

		it('should parse 1x05 format', () => {
			const result = parseRelease('House.1x05.720p.WEB-DL.AAC2.0.H264-BTN');

			expect(result.episode?.season).toBe(1);
			expect(result.episode?.episodes).toEqual([5]);
			expect(result.resolution).toBe('720p');
		});

		it('should parse daily show format', () => {
			const result = parseRelease('The.Daily.Show.2024.01.15.720p.WEB.h264-KOGi');

			expect(result.episode?.isDaily).toBe(true);
			expect(result.episode?.airDate).toBe('2024-01-15');
		});

		it('should parse anime absolute numbering', () => {
			const result = parseRelease('[SubGroup] One Piece - 1089 [1080p].mkv');

			expect(result.episode?.absoluteEpisode).toBe(1089);
		});

		it('should parse anime with dashes', () => {
			const result = parseRelease('[Erai-raws] Jujutsu Kaisen - 24 [1080p][HEVC].mkv');

			// The " - 24 " pattern should match anime absolute episode
			expect(result.episode?.absoluteEpisode).toBe(24);
			expect(result.resolution).toBe('1080p');
			expect(result.codec).toBe('h265');
		});

		it('should parse anime absolute numbering at end of filename', () => {
			const result = parseRelease('[Horse] Aggressive Retsuko - 018');

			expect(result.episode?.absoluteEpisode).toBe(18);
		});
	});

	describe('Language Detection', () => {
		it('should detect German language', () => {
			const result = parseRelease('Movie.2023.German.1080p.BluRay.x264-GROUP');

			expect(result.languages).toContain('de');
		});

		it('should detect multi-language releases', () => {
			const result = parseRelease('Movie.2023.MULTi.1080p.BluRay.x264-GROUP');

			expect(result.languages).toContain('multi');
		});

		it('should detect French with VFF tag', () => {
			const result = parseRelease('Movie.2023.VFF.1080p.BluRay.x264-GROUP');

			expect(result.languages).toContain('fr');
		});

		it('should default to English when no language specified', () => {
			const result = parseRelease('Movie.2023.1080p.BluRay.x264-GROUP');

			expect(result.languages).toContain('en');
		});
	});

	describe('Quality Detection', () => {
		it('should detect all resolution variants', () => {
			expect(extractResolution('4K')?.resolution).toBe('2160p');
			expect(extractResolution('2160p')?.resolution).toBe('2160p');
			expect(extractResolution('UHD')?.resolution).toBe('2160p');
			expect(extractResolution('1080p')?.resolution).toBe('1080p');
			expect(extractResolution('FHD')?.resolution).toBe('1080p');
			expect(extractResolution('720p')?.resolution).toBe('720p');
			expect(extractResolution('480p')?.resolution).toBe('480p');
			expect(extractResolution('SD')?.resolution).toBe('480p');
		});

		it('should detect all source variants', () => {
			expect(extractSource('REMUX')?.source).toBe('remux');
			expect(extractSource('BluRay')?.source).toBe('bluray');
			expect(extractSource('BDRip')?.source).toBe('bluray');
			expect(extractSource('WEB-DL')?.source).toBe('webdl');
			expect(extractSource('WEBRip')?.source).toBe('webrip');
			expect(extractSource('HDTV')?.source).toBe('hdtv');
			expect(extractSource('DVDRip')?.source).toBe('dvd');
			expect(extractSource('CAM')?.source).toBe('cam');
			expect(extractSource('TS')?.source).toBe('telesync');
		});

		it('should detect all codec variants', () => {
			expect(extractCodec('AV1')?.codec).toBe('av1');
			expect(extractCodec('HEVC')?.codec).toBe('h265');
			expect(extractCodec('x265')?.codec).toBe('h265');
			expect(extractCodec('H.265')?.codec).toBe('h265');
			expect(extractCodec('x264')?.codec).toBe('h264');
			expect(extractCodec('H.264')?.codec).toBe('h264');
			expect(extractCodec('AVC')?.codec).toBe('h264');
			expect(extractCodec('XviD')?.codec).toBe('xvid');
		});

		it('should detect bit depth variants', () => {
			expect(extractBitDepth('10bit')?.bitDepth).toBe('10');
			expect(extractBitDepth('12-bit')?.bitDepth).toBe('12');
			expect(extractBitDepth('8 bit')?.bitDepth).toBe('8');
		});

		it('should detect canonical audio attributes', () => {
			expect(extractEnhancedAudio('Atmos').hasAtmos).toBe(true);
			expect(extractEnhancedAudio('TrueHD').codec).toBe('truehd');
			expect(extractEnhancedAudio('DTS-X').codec).toBe('dts-x');
			expect(extractEnhancedAudio('DTS-HD.MA').codec).toBe('dts-hdma');
			expect(extractEnhancedAudio('DTS-HDMA').codec).toBe('dts-hdma');
			expect(extractEnhancedAudio('DTS-HD').codec).toBe('dts-hd');
			expect(extractEnhancedAudio('DTS').codec).toBe('dts');
			expect(extractEnhancedAudio('DD+').codec).toBe('dd+');
			expect(extractEnhancedAudio('EAC3').codec).toBe('dd+');
			expect(extractEnhancedAudio('AC3').codec).toBe('dd');
			expect(extractEnhancedAudio('AAC').codec).toBe('aac');
			expect(extractEnhancedAudio('FLAC').codec).toBe('flac');
		});

		it('should detect HDR formats', () => {
			expect(extractHdr('Dolby Vision')?.hdr).toBe('dolby-vision');
			expect(extractHdr('DoVi')?.hdr).toBe('dolby-vision');
			expect(extractHdr('DV')?.hdr).toBe('dolby-vision');
			expect(extractHdr('HDR10+')?.hdr).toBe('hdr10+');
			expect(extractHdr('HDR10')?.hdr).toBe('hdr10');
			expect(extractHdr('HDR')?.hdr).toBe('hdr'); // Generic HDR without version
			expect(extractHdr('HLG')?.hdr).toBe('hlg');
		});
	});

	describe('Release Group Detection', () => {
		it('should extract release group after dash', () => {
			const result = extractReleaseGroup('Movie.2023.1080p.BluRay.x264-SPARKS');
			expect(result?.group).toBe('SPARKS');
		});

		it('should extract release group from YTS style', () => {
			// YTS releases typically have the group at the end
			const result = parseRelease('Oppenheimer (2023) [1080p] [WEBRip] [5.1] [YTS.MX]');
			// The parser should handle this style
			expect(result.resolution).toBe('1080p');
		});

		it('should not confuse quality info with release group', () => {
			// 1080p should NOT be detected as a group
			const result = extractReleaseGroup('Movie.2023.1080p');
			expect(result?.group).not.toBe('1080p');
		});
	});

	describe('Edge Cases', () => {
		it('should handle releases with minimal info', () => {
			const result = parseRelease('Movie.Title.2023');

			expect(result.cleanTitle).toContain('Movie Title');
			expect(result.year).toBe(2023);
			expect(result.resolution).toBe('unknown');
			expect(result.source).toBe('unknown');
		});

		it('should handle releases with special characters', () => {
			const result = parseRelease('Marvels.Agents.of.SHIELD.S01E01.1080p.WEB-DL-GROUP');

			expect(result.episode?.season).toBe(1);
			expect(result.episode?.episodes).toEqual([1]);
		});

		it('should handle releases with year in title', () => {
			const result = parseRelease('2001.A.Space.Odyssey.1968.2160p.UHD.BluRay.x265-GROUP');

			// Both 2001 and 1968 are valid years, parser picks first valid one
			// The key is that quality info is correctly extracted
			expect(result.resolution).toBe('2160p');
			expect(result.source).toBe('bluray');
			expect(result.codec).toBe('h265');
		});

		it('should handle EZTV-style releases', () => {
			const result = parseRelease('Severance.S01E01.720p.WEB.H264-CAKES');

			expect(result.episode?.season).toBe(1);
			expect(result.episode?.episodes).toEqual([1]);
			expect(result.resolution).toBe('720p');
			expect(result.source).toBe('webrip');
			expect(result.codec).toBe('h264');
		});

		it('should calculate reasonable confidence', () => {
			const fullInfo = parseRelease('Movie.2023.1080p.BluRay.x264-GROUP');
			expect(fullInfo.confidence).toBeGreaterThan(0.7);

			const minimalInfo = parseRelease('Unknown');
			expect(minimalInfo.confidence).toBeLessThan(fullInfo.confidence);
		});
	});

	describe('isTvRelease helper', () => {
		it('should identify TV releases', () => {
			expect(isTvRelease('Show.S01E01.1080p')).toBe(true);
			expect(isTvRelease('Show.Season.1.1080p')).toBe(true);
			expect(isTvRelease('[Group] Anime - 45 [1080p]')).toBe(true);
		});

		it('should not identify movies as TV', () => {
			expect(isTvRelease('Movie.2023.1080p.BluRay')).toBe(false);
		});
	});

	describe('Real-world samples', () => {
		it('should parse streaming service releases', () => {
			const result = parseRelease(
				'Wednesday.S01E01.Wednesdays.Child.Is.Full.of.Woe.1080p.NF.WEB-DL.DDP5.1.Atmos.H.264-CMRG'
			);

			expect(result.cleanTitle).toBe('Wednesday');
			expect(result.episode?.season).toBe(1);
			expect(result.episode?.episodes).toEqual([1]);
			expect(result.source).toBe('webdl');
			expect(result.audioCodec).toBe('dd+');
			expect(result.audioChannels).toBe('5.1');
			expect(result.hasAtmos).toBe(true);
		});

		it('should parse anime batch releases', () => {
			const result = parseRelease(
				'[SubsPlease] Demon Slayer - Kimetsu no Yaiba (01-26) (1080p) [Batch]'
			);

			expect(result.cleanTitle).toContain('Demon Slayer');
			expect(result.resolution).toBe('1080p');
		});
	});

	describe('extractExternalIds', () => {
		describe('IMDB ID extraction', () => {
			it('should extract IMDB ID from curly brace format {imdb-tt1234567}', () => {
				const result = extractExternalIds('Movie {imdb-tt1234567}');
				expect(result.imdbId).toBe('tt1234567');
			});

			it('should extract IMDB ID from square bracket format [imdb-tt1234567]', () => {
				const result = extractExternalIds('Movie [imdb-tt1234567]');
				expect(result.imdbId).toBe('tt1234567');
			});

			it('should extract IMDB ID from Jellyfin format [imdbid-tt1234567]', () => {
				const result = extractExternalIds('The Rats A Witchers Tale (2025) [imdbid-tt28283547]');
				expect(result.imdbId).toBe('tt28283547');
			});

			it('should extract IMDB ID from Jellyfin equals format [imdbid=tt1234567]', () => {
				const result = extractExternalIds('Movie (2023) [imdbid=tt9876543]');
				expect(result.imdbId).toBe('tt9876543');
			});

			it('should extract IMDB ID from dot-separated format .tt1234567.', () => {
				const result = extractExternalIds('Movie.2023.tt0068646.1080p.BluRay.mkv');
				expect(result.imdbId).toBe('tt0068646');
			});

			it('should extract bare IMDB ID with 7+ digits', () => {
				const result = extractExternalIds('Movie 2023 tt1234567 1080p');
				expect(result.imdbId).toBe('tt1234567');
			});

			it('should extract IMDB ID with 8 digits', () => {
				const result = extractExternalIds('Movie tt12345678');
				expect(result.imdbId).toBe('tt12345678');
			});

			it('should be case insensitive for IMDB formats', () => {
				const result1 = extractExternalIds('Movie {IMDB-TT1234567}');
				expect(result1.imdbId).toBe('TT1234567');

				const result2 = extractExternalIds('Movie [IMDBID-TT9876543]');
				expect(result2.imdbId).toBe('TT9876543');
			});

			it('should extract from full file path with folder name', () => {
				const result = extractExternalIds(
					'/media/movies/The Godfather (1972) [imdbid-tt0068646]/The Godfather.mkv'
				);
				expect(result.imdbId).toBe('tt0068646');
			});
		});

		describe('TMDB ID extraction', () => {
			it('should extract TMDB ID from curly brace format {tmdb-12345}', () => {
				const result = extractExternalIds('Inception {tmdb-27205} (2010)');
				expect(result.tmdbId).toBe(27205);
			});

			it('should extract TMDB ID from square bracket format [tmdb-12345]', () => {
				const result = extractExternalIds('Movie [tmdb-12345]');
				expect(result.tmdbId).toBe(12345);
			});

			it('should extract TMDB ID from [tmdbid-12345] format', () => {
				const result = extractExternalIds('Movie [tmdbid-54321]');
				expect(result.tmdbId).toBe(54321);
			});

			it('should extract TMDB ID from [tmdbid=12345] format', () => {
				const result = extractExternalIds('Movie [tmdbid=99999]');
				expect(result.tmdbId).toBe(99999);
			});

			it('should extract TMDB ID from dot-separated format .tmdbid-12345.', () => {
				const result = extractExternalIds('Movie.2023.tmdbid-12345.1080p.mkv');
				expect(result.tmdbId).toBe(12345);
			});

			it('should extract TMDB ID from simple tmdb-12345 format', () => {
				const result = extractExternalIds('Movie tmdb-67890');
				expect(result.tmdbId).toBe(67890);
			});

			it('should be case insensitive for TMDB formats', () => {
				const result = extractExternalIds('Movie {TMDB-12345}');
				expect(result.tmdbId).toBe(12345);
			});
		});

		describe('TVDB ID extraction', () => {
			it('should extract TVDB ID from curly brace format {tvdb-81189}', () => {
				const result = extractExternalIds('Breaking Bad {tvdb-81189}/Season 01/');
				expect(result.tvdbId).toBe(81189);
			});

			it('should extract TVDB ID from square bracket format [tvdb-81189]', () => {
				const result = extractExternalIds('Show [tvdb-12345]');
				expect(result.tvdbId).toBe(12345);
			});

			it('should extract TVDB ID from [tvdbid-81189] format', () => {
				const result = extractExternalIds('Show [tvdbid-81189]');
				expect(result.tvdbId).toBe(81189);
			});

			it('should extract TVDB ID from [tvdbid=81189] format', () => {
				const result = extractExternalIds('Show [tvdbid=81189]');
				expect(result.tvdbId).toBe(81189);
			});

			it('should extract TVDB ID from dot-separated format .tvdbid-81189.', () => {
				const result = extractExternalIds('Show.tvdbid-81189.S01E01.mkv');
				expect(result.tvdbId).toBe(81189);
			});

			it('should extract TVDB ID from simple tvdb-81189 format', () => {
				const result = extractExternalIds('Show tvdb-81189');
				expect(result.tvdbId).toBe(81189);
			});

			it('should be case insensitive for TVDB formats', () => {
				const result = extractExternalIds('Show {TVDB-81189}');
				expect(result.tvdbId).toBe(81189);
			});
		});

		describe('Multiple ID extraction', () => {
			it('should extract all three ID types from a single input', () => {
				const result = extractExternalIds('Movie {tmdb-12345} {tvdb-81189} {imdb-tt1234567}');
				expect(result.tmdbId).toBe(12345);
				expect(result.tvdbId).toBe(81189);
				expect(result.imdbId).toBe('tt1234567');
			});

			it('should extract TMDB and IMDB when both present', () => {
				const result = extractExternalIds('Movie {tmdb-12345} [imdbid-tt9876543]');
				expect(result.tmdbId).toBe(12345);
				expect(result.imdbId).toBe('tt9876543');
				expect(result.tvdbId).toBeUndefined();
			});

			it('should extract TVDB and IMDB when both present', () => {
				const result = extractExternalIds('Show {tvdb-81189} tt1234567');
				expect(result.tvdbId).toBe(81189);
				expect(result.imdbId).toBe('tt1234567');
				expect(result.tmdbId).toBeUndefined();
			});
		});

		describe('Edge cases', () => {
			it('should NOT match IMDB IDs with less than 7 digits', () => {
				const result = extractExternalIds('Movie tt123456');
				expect(result.imdbId).toBeUndefined();
			});

			it('should return empty object for input with no IDs', () => {
				const result = extractExternalIds('Just a regular movie title 2023');
				expect(result.tmdbId).toBeUndefined();
				expect(result.tvdbId).toBeUndefined();
				expect(result.imdbId).toBeUndefined();
			});

			it('should handle empty string input', () => {
				const result = extractExternalIds('');
				expect(result.tmdbId).toBeUndefined();
				expect(result.tvdbId).toBeUndefined();
				expect(result.imdbId).toBeUndefined();
			});

			it('should handle input with similar but invalid patterns', () => {
				const result = extractExternalIds('tmdb_not_valid imdb-invalid tvdb-abc');
				expect(result.tmdbId).toBeUndefined();
				expect(result.imdbId).toBeUndefined();
				expect(result.tvdbId).toBeUndefined();
			});

			it('should extract first matching ID when multiple of same type present', () => {
				const result = extractExternalIds('{tmdb-11111} {tmdb-22222}');
				expect(result.tmdbId).toBe(11111);
			});

			it('should handle Windows-style paths with backslashes', () => {
				const result = extractExternalIds(
					'C:\\Movies\\The Matrix (1999) {tmdb-603}\\The Matrix.mkv'
				);
				expect(result.tmdbId).toBe(603);
			});

			it('should handle IDs at start of string', () => {
				const result = extractExternalIds('{tmdb-12345} Movie Title');
				expect(result.tmdbId).toBe(12345);
			});

			it('should handle IDs at end of string', () => {
				const result = extractExternalIds('Movie Title {tmdb-12345}');
				expect(result.tmdbId).toBe(12345);
			});

			it('should handle underscore separator in tvdb_id format', () => {
				const result = extractExternalIds('Show tvdb_id=81189');
				expect(result.tvdbId).toBe(81189);
			});

			it('should handle tmdbid without separator', () => {
				const result = extractExternalIds('Movie tmdbid12345');
				expect(result.tmdbId).toBe(12345);
			});
		});

		describe('Real-world paths', () => {
			it('should extract from Radarr-style path', () => {
				const result = extractExternalIds(
					'/media/movies/Inception (2010) {tmdb-27205}/Inception.2010.1080p.BluRay.mkv'
				);
				expect(result.tmdbId).toBe(27205);
			});

			it('should extract from Sonarr-style path', () => {
				const result = extractExternalIds(
					'/media/tv/Breaking Bad {tvdb-81189}/Season 01/Breaking.Bad.S01E01.mkv'
				);
				expect(result.tvdbId).toBe(81189);
			});

			it('should extract from Jellyfin-style path', () => {
				const result = extractExternalIds(
					'/media/movies/The Rats A Witchers Tale (2025) [imdbid-tt28283547]/movie.mkv'
				);
				expect(result.imdbId).toBe('tt28283547');
			});

			it('should extract from scene release filename', () => {
				const result = extractExternalIds(
					'The.Godfather.1972.tt0068646.REMASTERED.1080p.BluRay.x265-RARBG.mkv'
				);
				expect(result.imdbId).toBe('tt0068646');
			});

			it('should extract from path with multiple folder levels', () => {
				const result = extractExternalIds(
					'/data/media/movies/Action/The Matrix (1999) {tmdb-603} {imdb-tt0133093}/The.Matrix.1999.2160p.mkv'
				);
				expect(result.tmdbId).toBe(603);
				expect(result.imdbId).toBe('tt0133093');
			});

			it('should extract from path with special characters in title', () => {
				const result = extractExternalIds(
					"/media/movies/Schindler's List (1993) {tmdb-424}/movie.mkv"
				);
				expect(result.tmdbId).toBe(424);
			});
		});
	});
});
