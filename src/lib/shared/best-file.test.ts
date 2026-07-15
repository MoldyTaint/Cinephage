import { describe, it, expect } from 'vitest';
import {
	pickBestMovieFile,
	effectiveResolutions,
	redundantMovieFileIds,
	type RankableMovieFile
} from './best-file.js';

const file = (
	id: string,
	resolution: string | undefined,
	size = 100,
	path = `${id}.mkv`
): RankableMovieFile & { id: string } => ({
	id,
	relativePath: path,
	quality: resolution ? { resolution } : null,
	size
});

describe('pickBestMovieFile', () => {
	it('returns undefined for an empty array', () => {
		expect(pickBestMovieFile([])).toBeUndefined();
	});

	it('returns undefined for null', () => {
		expect(pickBestMovieFile(null)).toBeUndefined();
	});

	it('returns undefined for undefined', () => {
		expect(pickBestMovieFile(undefined)).toBeUndefined();
	});

	it('returns the only file when given a single file', () => {
		const f = file('a', '1080p');
		expect(pickBestMovieFile([f])?.id).toBe('a');
	});

	it('prefers a non-strm 2160p file over a 1080p file and a strm 2160p file', () => {
		const real1080 = file('1080', '1080p', 5000);
		const strm4k = file('strm4k', '2160p', 5000, 'strm4k.strm');
		const real4k = file('4k', '2160p', 5000);
		expect(pickBestMovieFile([real1080, strm4k, real4k])?.id).toBe('4k');
	});

	it('prefers a downloaded lower resolution over a strm higher resolution', () => {
		const strm4k = file('strm4k', '2160p', 9000, 'strm4k.strm');
		const real1080 = file('1080', '1080p', 1000);
		expect(pickBestMovieFile([strm4k, real1080])?.id).toBe('1080');
	});

	it('prefers larger size when resolution ties', () => {
		const small = file('small', '1080p', 500);
		const big = file('big', '1080p', 5000);
		expect(pickBestMovieFile([small, big])?.id).toBe('big');
	});

	it('prefers larger size when resolution ties regardless of order', () => {
		const big = file('big', '1080p', 5000);
		const small = file('small', '1080p', 500);
		expect(pickBestMovieFile([big, small])?.id).toBe('big');
	});

	it('keeps the first file when sizes tie', () => {
		const first = file('first', '1080p', 5000);
		const second = file('second', '1080p', 5000);
		expect(pickBestMovieFile([first, second])?.id).toBe('first');
	});

	it('preserves extra fields of the picked file through the generic', () => {
		interface RichFile extends RankableMovieFile {
			id: string;
			releaseGroup: string;
		}
		const f: RichFile = {
			id: 'rich',
			relativePath: 'rich.mkv',
			quality: { resolution: '2160p' },
			size: 3000,
			releaseGroup: 'GROUP'
		};
		const picked = pickBestMovieFile<RichFile>([f]);
		expect(picked?.releaseGroup).toBe('GROUP');
	});
});

describe('effectiveResolutions', () => {
	it('returns empty for null input', () => {
		expect(effectiveResolutions(null)).toEqual([]);
	});

	it('returns empty for empty input', () => {
		expect(effectiveResolutions([])).toEqual([]);
	});

	it('drops unknown and unrecognized resolutions', () => {
		expect(effectiveResolutions(['2160p', 'unknown', '1080p', 'bogus' as string])).toEqual([
			'2160p',
			'1080p'
		]);
	});

	it('dedupes preserving declared order', () => {
		expect(effectiveResolutions(['1080p', '2160p', '1080p'])).toEqual(['1080p', '2160p']);
	});

	it('drops resolutions below the min bound', () => {
		expect(effectiveResolutions(['2160p', '1080p', '720p'], '1080p')).toEqual(['2160p', '1080p']);
	});

	it('drops resolutions above the max bound', () => {
		expect(effectiveResolutions(['2160p', '1080p', '720p'], undefined, '1080p')).toEqual([
			'1080p',
			'720p'
		]);
	});

	it('clamps to a min/max range', () => {
		expect(effectiveResolutions(['2160p', '1080p', '720p', '480p'], '720p', '1080p')).toEqual([
			'1080p',
			'720p'
		]);
	});
});

describe('redundantMovieFileIds', () => {
	it('returns empty for no files', () => {
		expect(redundantMovieFileIds([], ['2160p', '1080p'])).toEqual([]);
	});

	it('returns empty for null files', () => {
		expect(redundantMovieFileIds(null, ['2160p'])).toEqual([]);
	});

	it('multi-quality: flags files whose resolution is not desired', () => {
		const files = [file('4k', '2160p'), file('1080', '1080p'), file('720', '720p')];
		expect(redundantMovieFileIds(files, ['2160p', '1080p'])).toEqual(['720']);
	});

	it('multi-quality: keeps files in the desired set', () => {
		const files = [file('4k', '2160p'), file('1080', '1080p')];
		expect(redundantMovieFileIds(files, ['2160p', '1080p'])).toEqual([]);
	});

	it('single-quality: flags everything except the best file', () => {
		const files = [file('1080', '1080p'), file('720', '720p')];
		expect(redundantMovieFileIds(files, ['1080p'])).toEqual(['720']);
	});

	it('single-quality: keeps the best file regardless of order', () => {
		const big4k = file('4k', '2160p', 5000);
		const small1080 = file('1080', '1080p', 100);
		expect(redundantMovieFileIds([small1080, big4k], ['1080p'])).toEqual(['1080']);
	});

	it('never flags unknown-resolution files (multi-quality)', () => {
		const files = [file('4k', '2160p'), file('unk', 'unknown'), file('none', undefined)];
		expect(redundantMovieFileIds(files, ['2160p', '1080p'])).toEqual([]);
	});

	it('never flags unknown-resolution files (single-quality)', () => {
		const files = [file('4k', '2160p'), file('unk', 'unknown'), file('none', undefined)];
		expect(redundantMovieFileIds(files, ['2160p'])).toEqual([]);
	});

	it('empty effective behaves as single-quality: keeps only the best file', () => {
		const files = [file('4k', '2160p'), file('1080', '1080p')];
		expect(redundantMovieFileIds(files, [])).toEqual(['1080']);
	});
});
