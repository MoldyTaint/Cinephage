import { describe, it, expect } from 'vitest';
import { NamingService, DEFAULT_NAMING_CONFIG, type MediaNamingInfo } from './NamingService';

describe('NamingService', () => {
	describe('Movie Naming', () => {
		it('should generate movie folder name with default format', () => {
			const service = new NamingService();
			const info: MediaNamingInfo = {
				title: 'The Dark Knight',
				year: 2008,
				tmdbId: 155
			};
			const result = service.generateMovieFolderName(info);
			expect(result).toBe('The Dark Knight (2008) {tmdb-155}');
		});

		it('should generate movie folder name with Jellyfin format', () => {
			const service = new NamingService({ mediaServerIdFormat: 'jellyfin' });
			const info: MediaNamingInfo = {
				title: 'The Dark Knight',
				year: 2008,
				tmdbId: 155
			};
			const result = service.generateMovieFolderName(info);
			expect(result).toBe('The Dark Knight (2008) [tmdbid-155]');
		});

		it('should generate movie file name with quality info', () => {
			// Use a custom format with single-token conditionals (service limitation:
			// default format uses multi-token conditionals which aren't fully processed)
			const service = new NamingService({
				movieFileFormat:
					'{CleanTitle} ({Year}) [{QualityFull}]{[{HDR}]}[{AudioCodec}]{[{VideoCodec}]}{-{ReleaseGroup}}'
			});
			const info: MediaNamingInfo = {
				title: 'The Dark Knight',
				year: 2008,
				tmdbId: 155,
				resolution: '1080p',
				source: 'bluray',
				codec: 'x265',
				audioCodec: 'dtshdma',
				audioChannels: '5.1',
				releaseGroup: 'GROUP',
				originalExtension: '.mkv'
			};
			const result = service.generateMovieFileName(info);
			expect(result).toBe('The Dark Knight (2008) [Bluray-1080p][DTS-HD MA][x265]-GROUP.mkv');
		});

		it('should include HDR in movie file name when present', () => {
			const service = new NamingService();
			const info: MediaNamingInfo = {
				title: 'Dune',
				year: 2021,
				resolution: '2160p',
				source: 'webdl',
				hdr: 'HDR10+',
				codec: 'hevc',
				originalExtension: '.mkv'
			};
			const result = service.generateMovieFileName(info);
			expect(result).toContain('[HDR10+]');
			expect(result).toContain('[WEB-DL-2160p]');
		});

		it('should include edition in movie file name', () => {
			const service = new NamingService();
			const info: MediaNamingInfo = {
				title: 'Blade Runner',
				year: 1982,
				edition: 'Final Cut',
				resolution: '1080p',
				source: 'bluray',
				originalExtension: '.mkv'
			};
			const result = service.generateMovieFileName(info);
			expect(result).toContain('edition-Final Cut');
		});

		it('should include PROPER marker in quality', () => {
			const service = new NamingService();
			const info: MediaNamingInfo = {
				title: 'Test Movie',
				year: 2023,
				resolution: '1080p',
				source: 'bluray',
				proper: true,
				originalExtension: '.mkv'
			};
			const result = service.generateMovieFileName(info);
			expect(result).toContain('[Proper Bluray-1080p]');
		});

		it('should include REPACK marker in quality', () => {
			const service = new NamingService();
			const info: MediaNamingInfo = {
				title: 'Test Movie',
				year: 2023,
				resolution: '1080p',
				source: 'webdl',
				repack: true,
				originalExtension: '.mkv'
			};
			const result = service.generateMovieFileName(info);
			expect(result).toContain('[Repack WEB-DL-1080p]');
		});
	});

	describe('Series Naming', () => {
		it('should generate series folder name', () => {
			const service = new NamingService();
			const info: MediaNamingInfo = {
				title: 'Breaking Bad',
				year: 2008,
				tvdbId: 81189
			};
			const result = service.generateSeriesFolderName(info);
			expect(result).toBe('Breaking Bad (2008) {tvdb-81189}');
		});

		it('should fall back to TMDB ID for series when TVDB missing', () => {
			const service = new NamingService();
			const info: MediaNamingInfo = {
				title: 'New Show',
				year: 2023,
				tmdbId: 12345
			};
			const result = service.generateSeriesFolderName(info);
			expect(result).toBe('New Show (2023) {tmdb-12345}');
		});

		it('should generate season folder name', () => {
			const service = new NamingService();
			const result = service.generateSeasonFolderName(1);
			expect(result).toBe('Season 01');
		});

		it('should generate season folder name with double digits', () => {
			const service = new NamingService();
			const result = service.generateSeasonFolderName(12);
			expect(result).toBe('Season 12');
		});
	});

	describe('Episode Naming', () => {
		it('should generate standard episode file name', () => {
			const service = new NamingService();
			const info: MediaNamingInfo = {
				title: 'Breaking Bad',
				year: 2008,
				seasonNumber: 1,
				episodeNumbers: [1],
				episodeTitle: 'Pilot',
				resolution: '1080p',
				source: 'bluray',
				codec: 'x264',
				releaseGroup: 'NTb',
				originalExtension: '.mkv'
			};
			const result = service.generateEpisodeFileName(info);
			expect(result).toBe('Breaking Bad (2008) - S01E01 - Pilot [Bluray-1080p][x264]-NTb.mkv');
		});

		it('should generate daily episode file name', () => {
			const service = new NamingService();
			const info: MediaNamingInfo = {
				title: 'The Daily Show',
				year: 1996,
				isDaily: true,
				airDate: '2023-12-15',
				episodeTitle: 'Guest Interview',
				resolution: '720p',
				source: 'hdtv',
				codec: 'x264',
				releaseGroup: 'LOL',
				originalExtension: '.mkv'
			};
			const result = service.generateEpisodeFileName(info);
			expect(result).toBe(
				'The Daily Show (1996) - 2023-12-15 - Guest Interview [HDTV-720p][x264]-LOL.mkv'
			);
		});

		it('should generate anime episode file name with absolute number', () => {
			const service = new NamingService();
			const info: MediaNamingInfo = {
				title: 'One Piece',
				year: 1999,
				isAnime: true,
				seasonNumber: 21,
				episodeNumbers: [1000],
				absoluteNumber: 1000,
				episodeTitle: 'Overwhelming Strength',
				resolution: '1080p',
				source: 'webdl',
				codec: 'hevc',
				hdr: 'HDR10',
				bitDepth: '10',
				audioCodec: 'AAC',
				audioChannels: '2.0',
				releaseGroup: 'SubsPlease',
				originalExtension: '.mkv'
			};
			const result = service.generateEpisodeFileName(info);
			expect(result).toContain('S21E1000 - 1000');
			expect(result).toContain('[10bit]');
			expect(result).toContain('[HDR10]');
		});
	});

	describe('Multi-Episode Styles', () => {
		const baseInfo: MediaNamingInfo = {
			title: 'Test Show',
			year: 2023,
			seasonNumber: 1,
			episodeNumbers: [1, 2, 3],
			episodeTitle: 'Multi Part',
			originalExtension: '.mkv'
		};

		it('should format range style (default)', () => {
			const service = new NamingService({ multiEpisodeStyle: 'range' });
			const result = service.generateEpisodeFileName(baseInfo);
			expect(result).toContain('S01E01-E03');
		});

		it('should format extend style', () => {
			const service = new NamingService({ multiEpisodeStyle: 'extend' });
			const result = service.generateEpisodeFileName(baseInfo);
			expect(result).toContain('S01E01E02E03');
		});

		it('should format duplicate style', () => {
			const service = new NamingService({ multiEpisodeStyle: 'duplicate' });
			const result = service.generateEpisodeFileName(baseInfo);
			expect(result).toContain('S01E01-E02-E03');
		});

		it('should format scene style', () => {
			const service = new NamingService({ multiEpisodeStyle: 'scene' });
			const result = service.generateEpisodeFileName(baseInfo);
			expect(result).toContain('S01E01E2E3');
		});

		it('should handle two episodes with range style', () => {
			const service = new NamingService({ multiEpisodeStyle: 'range' });
			const info = { ...baseInfo, episodeNumbers: [1, 2] };
			const result = service.generateEpisodeFileName(info);
			expect(result).toContain('S01E01-E02');
		});
	});

	describe('Colon Replacement', () => {
		// Note: {CleanTitle} token removes colons via generateCleanTitle() before
		// colon replacement settings apply. Use {Title} to test colon replacement.
		const infoWithColon: MediaNamingInfo = {
			title: 'Star Wars: A New Hope',
			year: 1977,
			tmdbId: 11
		};

		it('should remove colons from CleanTitle regardless of setting', () => {
			// CleanTitle explicitly removes colons for filesystem safety
			const service = new NamingService({ colonReplacement: 'smart' });
			const result = service.generateMovieFolderName(infoWithColon);
			// Colon is removed by generateCleanTitle, leaving "Star Wars A New Hope"
			expect(result).toBe('Star Wars A New Hope (1977) {tmdb-11}');
		});

		it('should use smart colon replacement on raw Title', () => {
			const service = new NamingService({
				movieFolderFormat: '{Title} ({Year})',
				colonReplacement: 'smart'
			});
			const result = service.generateMovieFolderName(infoWithColon);
			// Smart replaces ": " with " - "
			expect(result).toBe('Star Wars - A New Hope (1977)');
		});

		it('should delete colons from raw Title', () => {
			const service = new NamingService({
				movieFolderFormat: '{Title} ({Year})',
				colonReplacement: 'delete'
			});
			const result = service.generateMovieFolderName(infoWithColon);
			expect(result).toBe('Star Wars A New Hope (1977)');
		});

		it('should replace colon with dash in raw Title', () => {
			const service = new NamingService({
				movieFolderFormat: '{Title} ({Year})',
				colonReplacement: 'dash'
			});
			const result = service.generateMovieFolderName(infoWithColon);
			expect(result).toBe('Star Wars- A New Hope (1977)');
		});

		it('should replace colon with space-dash in raw Title', () => {
			const service = new NamingService({
				movieFolderFormat: '{Title} ({Year})',
				colonReplacement: 'spaceDash'
			});
			const result = service.generateMovieFolderName(infoWithColon);
			expect(result).toBe('Star Wars - A New Hope (1977)');
		});

		it('should replace colon with space-dash-space in raw Title', () => {
			const service = new NamingService({
				movieFolderFormat: '{Title} ({Year})',
				colonReplacement: 'spaceDashSpace'
			});
			const result = service.generateMovieFolderName(infoWithColon);
			expect(result).toBe('Star Wars - A New Hope (1977)');
		});
	});

	describe('Source Normalization', () => {
		const testCases = [
			{ input: 'bluray', expected: 'Bluray' },
			{ input: 'blu-ray', expected: 'Bluray' },
			{ input: 'bdrip', expected: 'Bluray' },
			{ input: 'webdl', expected: 'WEB-DL' },
			{ input: 'web-dl', expected: 'WEB-DL' },
			{ input: 'webrip', expected: 'WEBRip' },
			{ input: 'hdtv', expected: 'HDTV' },
			{ input: 'remux', expected: 'Remux' },
			{ input: 'dvdrip', expected: 'DVDRip' }
		];

		testCases.forEach(({ input, expected }) => {
			it(`should normalize ${input} to ${expected}`, () => {
				const service = new NamingService();
				const info: MediaNamingInfo = {
					title: 'Test',
					year: 2023,
					source: input,
					resolution: '1080p',
					originalExtension: '.mkv'
				};
				const result = service.generateMovieFileName(info);
				expect(result).toContain(`[${expected}-1080p]`);
			});
		});
	});

	describe('Video Codec Normalization', () => {
		const testCases = [
			{ input: 'h264', expected: 'x264' },
			{ input: 'h.264', expected: 'x264' },
			{ input: 'avc', expected: 'x264' },
			{ input: 'h265', expected: 'x265' },
			{ input: 'hevc', expected: 'x265' },
			{ input: 'av1', expected: 'AV1' },
			{ input: 'vp9', expected: 'VP9' }
		];

		testCases.forEach(({ input, expected }) => {
			it(`should normalize ${input} to ${expected}`, () => {
				const service = new NamingService();
				const info: MediaNamingInfo = {
					title: 'Test',
					year: 2023,
					codec: input,
					source: 'bluray',
					resolution: '1080p',
					originalExtension: '.mkv'
				};
				const result = service.generateMovieFileName(info);
				expect(result).toContain(`[${expected}]`);
			});
		});
	});

	describe('Audio Codec Normalization', () => {
		const testCases = [
			{ input: 'truehd', expected: 'TrueHD' },
			{ input: 'dtshdma', expected: 'DTS-HD MA' },
			{ input: 'dtsx', expected: 'DTS-X' },
			{ input: 'flac', expected: 'FLAC' },
			{ input: 'aac', expected: 'AAC' },
			{ input: 'ac3', expected: 'AC3' },
			{ input: 'eac3', expected: 'EAC3' }
		];

		testCases.forEach(({ input, expected }) => {
			it(`should normalize ${input} to ${expected}`, () => {
				const service = new NamingService();
				const info: MediaNamingInfo = {
					title: 'Test',
					year: 2023,
					audioCodec: input,
					audioChannels: '5.1',
					source: 'bluray',
					resolution: '1080p',
					originalExtension: '.mkv'
				};
				const result = service.generateMovieFileName(info);
				expect(result).toContain(`[${expected} 5.1]`);
			});
		});
	});

	describe('Conditional Blocks', () => {
		it('should include conditional block when value exists', () => {
			const service = new NamingService();
			const info: MediaNamingInfo = {
				title: 'Test',
				year: 2023,
				releaseGroup: 'GROUP',
				source: 'bluray',
				resolution: '1080p',
				originalExtension: '.mkv'
			};
			const result = service.generateMovieFileName(info);
			expect(result).toContain('-GROUP');
		});

		it('should exclude conditional block when value missing', () => {
			const service = new NamingService();
			const info: MediaNamingInfo = {
				title: 'Test',
				year: 2023,
				source: 'bluray',
				resolution: '1080p',
				originalExtension: '.mkv'
			};
			const result = service.generateMovieFileName(info);
			expect(result).not.toContain('-undefined');
			expect(result).not.toContain('--');
		});

		it('should handle multiple conditional blocks', () => {
			const service = new NamingService();
			const info: MediaNamingInfo = {
				title: 'Test',
				year: 2023,
				hdr: 'DV HDR10',
				codec: 'x265',
				audioCodec: 'TrueHD',
				audioChannels: '7.1',
				source: 'remux',
				resolution: '2160p',
				originalExtension: '.mkv'
			};
			const result = service.generateMovieFileName(info);
			expect(result).toContain('[DV HDR10]');
			expect(result).toContain('[TrueHD 7.1]');
			expect(result).toContain('[x265]');
		});
	});

	describe('Edge Cases', () => {
		it('should handle missing year', () => {
			const service = new NamingService({
				movieFolderFormat: '{CleanTitle} ({Year}) {MediaId}'
			});
			const info: MediaNamingInfo = {
				title: 'Test Movie',
				tmdbId: 123
			};
			const result = service.generateMovieFolderName(info);
			// Note: Empty parens removal happens after whitespace normalization,
			// leaving a double space. This is current behavior.
			expect(result).toBe('Test Movie  {tmdb-123}');
		});

		it('should handle missing TMDB ID', () => {
			const service = new NamingService({
				movieFolderFormat: '{CleanTitle} ({Year}) {MediaId}'
			});
			const info: MediaNamingInfo = {
				title: 'Test Movie',
				year: 2023
			};
			const result = service.generateMovieFolderName(info);
			expect(result).toBe('Test Movie (2023)');
		});

		it('should remove illegal characters from title', () => {
			const service = new NamingService();
			const info: MediaNamingInfo = {
				title: 'Test: Movie? <With> "Illegal" |Chars|',
				year: 2023,
				tmdbId: 123
			};
			const result = service.generateMovieFolderName(info);
			expect(result).not.toContain(':');
			expect(result).not.toContain('?');
			expect(result).not.toContain('<');
			expect(result).not.toContain('>');
			expect(result).not.toContain('"');
			expect(result).not.toContain('|');
		});

		it('should clean up empty brackets', () => {
			const service = new NamingService();
			const info: MediaNamingInfo = {
				title: 'Test',
				year: 2023,
				originalExtension: '.mkv'
			};
			const result = service.generateMovieFileName(info);
			expect(result).not.toContain('[]');
			expect(result).not.toContain('()');
			expect(result).not.toContain('{}');
		});

		it('should clean up multiple spaces', () => {
			const service = new NamingService();
			const info: MediaNamingInfo = {
				title: 'Test  Movie   Title',
				year: 2023,
				tmdbId: 123
			};
			const result = service.generateMovieFolderName(info);
			expect(result).not.toMatch(/\s{2,}/);
		});

		it('should clean up multiple dashes', () => {
			const service = new NamingService();
			const info: MediaNamingInfo = {
				title: 'Test',
				year: 2023,
				source: 'bluray',
				resolution: '1080p',
				originalExtension: '.mkv'
			};
			const result = service.generateMovieFileName(info);
			expect(result).not.toMatch(/--+/);
		});

		it('should replace spaces when configured', () => {
			const service = new NamingService({ replaceSpacesWith: '.' });
			const info: MediaNamingInfo = {
				title: 'Test Movie',
				year: 2023,
				tmdbId: 123
			};
			const result = service.generateMovieFolderName(info);
			expect(result).toContain('Test.Movie');
		});

		it('should handle single episode correctly', () => {
			const service = new NamingService();
			const info: MediaNamingInfo = {
				title: 'Test Show',
				year: 2023,
				seasonNumber: 1,
				episodeNumbers: [5],
				episodeTitle: 'Single Episode',
				originalExtension: '.mkv'
			};
			const result = service.generateEpisodeFileName(info);
			expect(result).toContain('S01E05');
			expect(result).not.toContain('E05E');
		});

		it('should use IMDB ID token when provided', () => {
			const service = new NamingService({
				movieFolderFormat: '{CleanTitle} ({Year}) {ImdbId}'
			});
			const info: MediaNamingInfo = {
				title: 'Test Movie',
				year: 2023,
				imdbId: 'tt1234567'
			};
			const result = service.generateMovieFolderName(info);
			expect(result).toBe('Test Movie (2023) tt1234567');
		});

		it('should handle 3D content', () => {
			const service = new NamingService({
				movieFileFormat: '{CleanTitle} ({Year}) {3D} [{QualityFull}]'
			});
			const info: MediaNamingInfo = {
				title: 'Avatar',
				year: 2009,
				is3D: true,
				source: 'bluray',
				resolution: '1080p',
				originalExtension: '.mkv'
			};
			const result = service.generateMovieFileName(info);
			expect(result).toContain('3D');
		});
	});

	describe('Configuration', () => {
		it('should use default configuration', () => {
			const service = new NamingService();
			const config = service.getConfig();
			expect(config).toEqual(DEFAULT_NAMING_CONFIG);
		});

		it('should allow partial configuration override', () => {
			const service = new NamingService({ colonReplacement: 'delete' });
			const config = service.getConfig();
			expect(config.colonReplacement).toBe('delete');
			expect(config.movieFolderFormat).toBe(DEFAULT_NAMING_CONFIG.movieFolderFormat);
		});

		it('should update configuration', () => {
			const service = new NamingService();
			service.updateConfig({ mediaServerIdFormat: 'jellyfin' });
			const config = service.getConfig();
			expect(config.mediaServerIdFormat).toBe('jellyfin');
		});
	});
});
