import { describe, it, expect, beforeEach } from 'vitest';
import { SubtitleScannerService } from './SubtitleScannerService';

describe('SubtitleScannerService', () => {
	let scanner: SubtitleScannerService;

	beforeEach(() => {
		scanner = SubtitleScannerService.getInstance();
	});

	describe('isSubtitleFile()', () => {
		it('should recognize .srt files', () => {
			expect(scanner.isSubtitleFile('movie.srt')).toBe(true);
			expect(scanner.isSubtitleFile('Movie.2023.1080p.BluRay.en.srt')).toBe(true);
		});

		it('should recognize .ass files', () => {
			expect(scanner.isSubtitleFile('movie.ass')).toBe(true);
		});

		it('should recognize .ssa files', () => {
			expect(scanner.isSubtitleFile('movie.ssa')).toBe(true);
		});

		it('should recognize .sub files', () => {
			expect(scanner.isSubtitleFile('movie.sub')).toBe(true);
		});

		it('should recognize .vtt files', () => {
			expect(scanner.isSubtitleFile('movie.vtt')).toBe(true);
		});

		it('should recognize .idx files', () => {
			expect(scanner.isSubtitleFile('movie.idx')).toBe(true);
		});

		it('should be case-insensitive', () => {
			expect(scanner.isSubtitleFile('movie.SRT')).toBe(true);
			expect(scanner.isSubtitleFile('movie.Srt')).toBe(true);
		});

		it('should reject non-subtitle files', () => {
			expect(scanner.isSubtitleFile('movie.mkv')).toBe(false);
			expect(scanner.isSubtitleFile('movie.mp4')).toBe(false);
			expect(scanner.isSubtitleFile('movie.txt')).toBe(false);
		});
	});

	describe('detectLanguage()', () => {
		describe('Full language names', () => {
			it('should detect English from filename', () => {
				expect(scanner.detectLanguage('movie.english.srt')).toBe('en');
				expect(scanner.detectLanguage('Movie.2023.English.srt')).toBe('en');
			});

			it('should detect Spanish from filename', () => {
				expect(scanner.detectLanguage('movie.spanish.srt')).toBe('es');
			});

			it('should detect French from filename', () => {
				expect(scanner.detectLanguage('movie.french.srt')).toBe('fr');
			});

			it('should detect German from filename', () => {
				expect(scanner.detectLanguage('movie.german.srt')).toBe('de');
			});

			it('should detect other languages', () => {
				expect(scanner.detectLanguage('movie.italian.srt')).toBe('it');
				expect(scanner.detectLanguage('movie.portuguese.srt')).toBe('pt');
				expect(scanner.detectLanguage('movie.russian.srt')).toBe('ru');
				expect(scanner.detectLanguage('movie.chinese.srt')).toBe('zh');
				expect(scanner.detectLanguage('movie.japanese.srt')).toBe('ja');
				expect(scanner.detectLanguage('movie.korean.srt')).toBe('ko');
			});
		});

		describe('ISO 639-1 codes (2-letter)', () => {
			it('should detect en code', () => {
				expect(scanner.detectLanguage('movie.en.srt')).toBe('en');
			});

			it('should detect es code', () => {
				expect(scanner.detectLanguage('movie.es.srt')).toBe('es');
			});

			it('should detect fr code', () => {
				expect(scanner.detectLanguage('movie.fr.srt')).toBe('fr');
			});

			it('should detect de code', () => {
				expect(scanner.detectLanguage('movie.de.srt')).toBe('de');
			});

			it('should detect other 2-letter codes', () => {
				expect(scanner.detectLanguage('movie.it.srt')).toBe('it');
				expect(scanner.detectLanguage('movie.pt.srt')).toBe('pt');
				expect(scanner.detectLanguage('movie.ru.srt')).toBe('ru');
				expect(scanner.detectLanguage('movie.zh.srt')).toBe('zh');
				expect(scanner.detectLanguage('movie.ja.srt')).toBe('ja');
			});
		});

		describe('3-letter codes', () => {
			it('should detect eng code', () => {
				expect(scanner.detectLanguage('movie.eng.srt')).toBe('en');
			});

			it('should detect spa code', () => {
				expect(scanner.detectLanguage('movie.spa.srt')).toBe('es');
			});

			it('should detect other 3-letter codes', () => {
				expect(scanner.detectLanguage('movie.fre.srt')).toBe('fr');
				expect(scanner.detectLanguage('movie.ger.srt')).toBe('de');
				expect(scanner.detectLanguage('movie.ita.srt')).toBe('it');
				expect(scanner.detectLanguage('movie.por.srt')).toBe('pt');
				expect(scanner.detectLanguage('movie.rus.srt')).toBe('ru');
			});
		});

		it('should default to undetermined when no language detected', () => {
			expect(scanner.detectLanguage('movie.srt')).toBe('und');
			expect(scanner.detectLanguage('Movie.2023.1080p.BluRay.srt')).toBe('und');
		});
	});

	describe('isForced()', () => {
		it('should detect .forced. pattern', () => {
			expect(scanner.isForced('movie.en.forced.srt')).toBe(true);
			expect(scanner.isForced('movie.forced.en.srt')).toBe(true);
		});

		it('should be case-insensitive', () => {
			expect(scanner.isForced('movie.en.FORCED.srt')).toBe(true);
			expect(scanner.isForced('movie.en.Forced.srt')).toBe(true);
		});

		it('should return false when not forced', () => {
			expect(scanner.isForced('movie.en.srt')).toBe(false);
			expect(scanner.isForced('movie.english.srt')).toBe(false);
		});
	});

	describe('isHearingImpaired()', () => {
		it('should detect .hi. pattern', () => {
			expect(scanner.isHearingImpaired('movie.en.hi.srt')).toBe(true);
		});

		it('should detect .sdh. pattern', () => {
			expect(scanner.isHearingImpaired('movie.en.sdh.srt')).toBe(true);
		});

		it('should detect .cc. pattern', () => {
			expect(scanner.isHearingImpaired('movie.en.cc.srt')).toBe(true);
		});

		it('should detect hearing-impaired in filename', () => {
			expect(scanner.isHearingImpaired('movie.en.hearing-impaired.srt')).toBe(true);
			expect(scanner.isHearingImpaired('movie.en.hearing_impaired.srt')).toBe(true);
			expect(scanner.isHearingImpaired('movie.en.hearingimpaired.srt')).toBe(true);
		});

		it('should be case-insensitive', () => {
			expect(scanner.isHearingImpaired('movie.en.HI.srt')).toBe(true);
			expect(scanner.isHearingImpaired('movie.en.SDH.srt')).toBe(true);
		});

		it('should return false when not hearing impaired', () => {
			expect(scanner.isHearingImpaired('movie.en.srt')).toBe(false);
			expect(scanner.isHearingImpaired('movie.english.srt')).toBe(false);
		});
	});

	describe('getFormat()', () => {
		it('should return srt for .srt files', () => {
			expect(scanner.getFormat('movie.srt')).toBe('srt');
		});

		it('should return ass for .ass files', () => {
			expect(scanner.getFormat('movie.ass')).toBe('ass');
		});

		it('should return ass for .ssa files (same format)', () => {
			expect(scanner.getFormat('movie.ssa')).toBe('ass');
		});

		it('should return sub for .sub files', () => {
			expect(scanner.getFormat('movie.sub')).toBe('sub');
		});

		it('should return vtt for .vtt files', () => {
			expect(scanner.getFormat('movie.vtt')).toBe('vtt');
		});

		it('should return unknown for unrecognized extensions', () => {
			expect(scanner.getFormat('movie.txt')).toBe('unknown');
		});
	});

	describe('Complex filename parsing', () => {
		it('should handle typical scene release names', () => {
			const filename = 'Movie.2023.1080p.BluRay.x264-GROUP.en.srt';
			expect(scanner.isSubtitleFile(filename)).toBe(true);
			expect(scanner.detectLanguage(filename)).toBe('en');
			expect(scanner.getFormat(filename)).toBe('srt');
		});

		it('should handle forced HI subtitles', () => {
			const filename = 'Movie.2023.en.forced.hi.srt';
			expect(scanner.isForced(filename)).toBe(true);
			expect(scanner.isHearingImpaired(filename)).toBe(true);
			expect(scanner.detectLanguage(filename)).toBe('en');
		});

		it('should handle multiple language codes in path', () => {
			const filename = 'Subs/en/Movie.2023.english.srt';
			expect(scanner.detectLanguage(filename)).toBe('en');
		});
	});
});
