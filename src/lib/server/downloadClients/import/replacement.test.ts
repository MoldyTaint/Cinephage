import { describe, expect, it } from 'vitest';
import { computeEpisodeReplacement, computeMovieReplacement } from './replacement.js';

const file = (id: string, resolution: string, extra: Record<string, unknown> = {}) => ({
	id,
	relativePath: `${id}.mkv`,
	quality: { resolution },
	...extra
});

describe('computeMovieReplacement', () => {
	it('single-quality: retires every existing file', () => {
		const ids = computeMovieReplacement({
			existingFiles: [file('a', '1080p'), file('b', '720p')],
			newResolution: '1080p',
			multiQuality: false,
			retire: true
		});
		expect(ids).toEqual(['a', 'b']);
	});

	it('single-quality with retire=false: retires nothing', () => {
		const ids = computeMovieReplacement({
			existingFiles: [file('a', '1080p')],
			newResolution: '1080p',
			multiQuality: false,
			retire: false
		});
		expect(ids).toEqual([]);
	});

	it('multi-quality: retires only the same resolution bucket', () => {
		const ids = computeMovieReplacement({
			existingFiles: [file('uhd', '2160p'), file('fhd', '1080p')],
			newResolution: '1080p',
			multiQuality: true,
			retire: true
		});
		expect(ids).toEqual(['fhd']);
	});

	it('multi-quality: never retires the just-imported file (self-deletion guard)', () => {
		const ids = computeMovieReplacement({
			existingFiles: [file('old', '1080p'), file('new', '1080p')],
			newResolution: '1080p',
			multiQuality: true,
			retire: true,
			keepFileIds: ['new']
		});
		expect(ids).toEqual(['old']);
	});

	it('multi-quality: empty bucket fills without retiring', () => {
		const ids = computeMovieReplacement({
			existingFiles: [file('fhd', '1080p')],
			newResolution: '2160p',
			multiQuality: true,
			retire: true
		});
		expect(ids).toEqual([]);
	});

	it('multi-quality: retires the same-bucket .strm placeholder', () => {
		const ids = computeMovieReplacement({
			existingFiles: [
				{
					id: 'strm-1080',
					relativePath: 'Movie.strm',
					quality: { resolution: '1080p' },
					isStrm: true
				},
				{
					id: 'strm-2160',
					relativePath: 'Movie.4k.strm',
					quality: { resolution: '2160p' },
					isStrm: true
				}
			],
			newResolution: '1080p',
			multiQuality: true,
			retire: true
		});
		expect(ids).toEqual(['strm-1080']);
	});
});

describe('computeEpisodeReplacement', () => {
	const pack = {
		id: 'pack',
		relativePath: 'Show.S01E01-E02.mkv',
		quality: { resolution: '1080p' },
		episodeIds: ['ep-1', 'ep-2']
	};
	const singleE01 = {
		id: 's01',
		relativePath: 'Show.S01E01.mkv',
		quality: { resolution: '720p' },
		episodeIds: ['ep-1']
	};

	it('retires a single-episode file fully covered by the incoming file', () => {
		const ids = computeEpisodeReplacement({
			existingFiles: [singleE01],
			incomingEpisodeIds: ['ep-1'],
			retireStrmPlaceholders: true
		});
		expect(ids).toEqual(['s01']);
	});

	// The 2026-09 audit finding: a single-episode upgrade deleted an
	// E01-E02 pack, leaving E02 missing.
	it('COVERAGE RULE: never retires a multi-episode pack the incoming file only partly covers', () => {
		const ids = computeEpisodeReplacement({
			existingFiles: [pack],
			incomingEpisodeIds: ['ep-2'],
			retireStrmPlaceholders: true
		});
		expect(ids).toEqual([]);
	});

	it('retires a multi-episode pack when the incoming acquisition covers every episode', () => {
		const ids = computeEpisodeReplacement({
			existingFiles: [pack],
			incomingEpisodeIds: ['ep-1', 'ep-2'],
			retireStrmPlaceholders: true
		});
		expect(ids).toEqual(['pack']);
	});

	it('ignores files covering none of the incoming episodes', () => {
		const other = { ...singleE01, id: 'other', episodeIds: ['ep-9'] };
		const ids = computeEpisodeReplacement({
			existingFiles: [other, pack],
			incomingEpisodeIds: ['ep-1', 'ep-2'],
			retireStrmPlaceholders: true
		});
		expect(ids).toEqual(['pack']);
	});

	it('never retires the just-imported file', () => {
		const incoming = {
			id: 'incoming',
			relativePath: 'Show.S01E01-E02.new.mkv',
			quality: { resolution: '1080p' },
			episodeIds: ['ep-1', 'ep-2']
		};
		const ids = computeEpisodeReplacement({
			existingFiles: [incoming, pack],
			incomingEpisodeIds: ['ep-1', 'ep-2'],
			keepFileIds: ['incoming'],
			retireStrmPlaceholders: true
		});
		expect(ids).toEqual(['pack']);
	});

	it('retires .strm placeholders for covered episodes even without full coverage', () => {
		const placeholder = {
			id: 'ph',
			relativePath: 'Show.S01E01-E02.strm',
			quality: { resolution: '1080p' },
			episodeIds: ['ep-1', 'ep-2']
		};
		const ids = computeEpisodeReplacement({
			existingFiles: [placeholder],
			incomingEpisodeIds: ['ep-1'],
			retireStrmPlaceholders: true
		});
		expect(ids).toEqual(['ph']);
	});
});
