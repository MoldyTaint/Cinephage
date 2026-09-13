import { describe, expect, it } from 'vitest';
import {
	detectSubtitleFormatFromContent,
	isSubtitleExtension,
	isZipContent,
	selectSubtitleZipEntry,
	type ZipEntryLike
} from './subtitle-content.js';

function entry(name: string, content: string): ZipEntryLike {
	return {
		entryName: name,
		isDirectory: false,
		getData: () => Buffer.from(content, 'utf-8')
	};
}

describe('detectSubtitleFormatFromContent', () => {
	it('detects SRT from timestamps', () => {
		expect(
			detectSubtitleFormatFromContent(
				Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nHello\n', 'utf-8')
			)
		).toBe('srt');
	});

	it('detects SRT with a UTF-8 BOM', () => {
		const content = Buffer.concat([
			Buffer.from([0xef, 0xbb, 0xbf]),
			Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nHello\n', 'utf-8')
		]);
		expect(detectSubtitleFormatFromContent(content)).toBe('srt');
	});

	it('detects VTT from the WEBVTT header', () => {
		expect(
			detectSubtitleFormatFromContent(
				Buffer.from('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n', 'utf-8')
			)
		).toBe('vtt');
	});

	it('treats header-less dot-separated timing as SRT (SRT accepts both separators)', () => {
		expect(
			detectSubtitleFormatFromContent(
				Buffer.from('00:00:01.000 --> 00:00:02.000\nHello\n', 'utf-8')
			)
		).toBe('srt');
	});

	it('detects ASS and SSA from the version tag', () => {
		expect(
			detectSubtitleFormatFromContent(
				Buffer.from('[Script Info]\nScriptType: v4.00+\n[Events]\n', 'utf-8')
			)
		).toBe('ass');
		expect(
			detectSubtitleFormatFromContent(
				Buffer.from('[Script Info]\nScriptType: v4.00\n[Events]\n', 'utf-8')
			)
		).toBe('ssa');
	});

	it('detects MicroDVD .sub from cue indices', () => {
		expect(
			detectSubtitleFormatFromContent(Buffer.from('{1}{1}23.976\nHello\n', 'utf-8'))
		).toBe('sub');
	});

	it('returns unknown for arbitrary text and binary payloads', () => {
		expect(detectSubtitleFormatFromContent(Buffer.from('just some random text', 'utf-8'))).toBe(
			'unknown'
		);
		expect(detectSubtitleFormatFromContent(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBe('unknown');
	});

	it('does not treat a zip header as a subtitle format', () => {
		expect(detectSubtitleFormatFromContent(Buffer.from('PK\x03\x04', 'binary'))).toBe('unknown');
	});

	it('recognizes zip magic bytes', () => {
		expect(isZipContent(Buffer.from('PK\x03\x04', 'binary'))).toBe(true);
		expect(isZipContent(Buffer.from('not a zip'))).toBe(false);
	});

	it('recognizes subtitle extensions case-insensitively', () => {
		expect(isSubtitleExtension('.SRT')).toBe(true);
		expect(isSubtitleExtension('ass')).toBe(true);
		expect(isSubtitleExtension('.mkv')).toBe(false);
	});
});

describe('selectSubtitleZipEntry', () => {
	it('uses the sole subtitle entry', () => {
		const result = selectSubtitleZipEntry([entry('Movie.srt', 'x')], { language: 'en' });
		expect(result.entry.entryName).toBe('Movie.srt');
		expect(result.ambiguous).toBe(false);
	});

	it('ignores directory entries and non-subtitle files', () => {
		const result = selectSubtitleZipEntry(
			[
				{ entryName: 'subs/', isDirectory: true, getData: () => Buffer.from('') },
				entry('readme.txt', 'x'),
				entry('Movie.en.srt', 'x')
			],
			{ language: 'en' }
		);
		expect(result.entry.entryName).toBe('Movie.en.srt');
	});

	it('throws when no subtitle entry exists', () => {
		expect(() => selectSubtitleZipEntry([entry('readme.txt', 'x')], { language: 'en' })).toThrow(
			'No subtitle file found in zip archive'
		);
	});

	it('prefers the exact language tag over other languages', () => {
		const result = selectSubtitleZipEntry(
			[entry('Movie.fr.srt', 'x'), entry('Movie.en.srt', 'x')],
			{ language: 'en' }
		);
		expect(result.entry.entryName).toBe('Movie.en.srt');
		expect(result.ambiguous).toBe(false);
	});

	it('accepts alpha-3 and region language variants', () => {
		const result = selectSubtitleZipEntry(
			[entry('Movie.eng.srt', 'x'), entry('Movie.pt-BR.srt', 'x')],
			{ language: 'en-US' }
		);
		expect(result.entry.entryName).toBe('Movie.eng.srt');
	});

	it('prefers the episode/release stem when languages tie', () => {
		const result = selectSubtitleZipEntry(
			[entry('Other.Release.en.srt', 'x'), entry('Show.S01E02.1080p.en.srt', 'x')],
			{ language: 'en', videoFileName: 'Show.S01E02.1080p.WEB.mkv' }
		);
		expect(result.entry.entryName).toBe('Show.S01E02.1080p.en.srt');
	});

	it('prefers forced/HI tagged entries when requested', () => {
		const result = selectSubtitleZipEntry(
			[entry('Movie.en.srt', 'x'), entry('Movie.en.forced.srt', 'x')],
			{ language: 'en', isForced: true }
		);
		expect(result.entry.entryName).toBe('Movie.en.forced.srt');

		const hi = selectSubtitleZipEntry(
			[entry('Movie.en.srt', 'x'), entry('Movie.en.sdh.srt', 'x')],
			{ language: 'en', isHearingImpaired: true }
		);
		expect(hi.entry.entryName).toBe('Movie.en.sdh.srt');
	});

	it('breaks ambiguous ties deterministically by entry name and reports ambiguity', () => {
		const result = selectSubtitleZipEntry(
			[entry('Movie.eng.srt', 'x'), entry('Movie.en.srt', 'x')],
			{ language: 'en' }
		);
		expect(result.ambiguous).toBe(true);
		// localeCompare: 'Movie.en.srt' < 'Movie.eng.srt'
		expect(result.entry.entryName).toBe('Movie.en.srt');
		expect(result.candidates).toEqual(['Movie.en.srt', 'Movie.eng.srt']);
	});

	it('never falls back to first-by-extension when nothing matches', () => {
		// Both entries are non-matching languages; the deterministic pick is the
		// alphabetically first candidate and the ambiguity is reported.
		const result = selectSubtitleZipEntry(
			[entry('Movie.zz.srt', 'x'), entry('Movie.aa.srt', 'x')],
			{ language: 'en' }
		);
		expect(result.ambiguous).toBe(true);
		expect(result.entry.entryName).toBe('Movie.aa.srt');
	});
});
