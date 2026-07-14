import { describe, it, expect } from 'vitest';
import {
	effectiveBuckets,
	isMultiQualityMode,
	getFilledResolutions,
	unfilledBuckets,
	selectBestExistingFileInBucket,
	selectBestFile,
	fileIdsToReplace,
	replaceIdsForImport,
	MULTI_QUALITY_MIN_BUCKETS,
	type BucketFile
} from './buckets.js';

describe('effectiveBuckets', () => {
	it('returns empty for null desired qualities', () => {
		expect(effectiveBuckets(null, null, null)).toEqual([]);
	});

	it('returns empty for empty array', () => {
		expect(effectiveBuckets([], null, null)).toEqual([]);
	});

	it('returns all valid resolutions when profile has no min/max', () => {
		expect(effectiveBuckets(['2160p', '1080p'], null, null)).toEqual(['2160p', '1080p']);
	});

	it('drops unknown resolution', () => {
		expect(effectiveBuckets(['2160p', 'unknown'], null, null)).toEqual(['2160p']);
	});

	it('deduplicates while preserving order', () => {
		expect(effectiveBuckets(['1080p', '2160p', '1080p'], null, null)).toEqual(['1080p', '2160p']);
	});

	it('filters out resolutions below profile minResolution', () => {
		expect(effectiveBuckets(['2160p', '1080p', '720p'], '1080p', null)).toEqual(['2160p', '1080p']);
	});

	it('filters out resolutions above profile maxResolution', () => {
		expect(effectiveBuckets(['2160p', '1080p', '720p'], null, '1080p')).toEqual(['1080p', '720p']);
	});

	it('clamps to both min and max', () => {
		expect(effectiveBuckets(['2160p', '1080p', '720p', '480p'], '720p', '1080p')).toEqual([
			'1080p',
			'720p'
		]);
	});
});

describe('isMultiQualityMode', () => {
	it('is false for zero buckets', () => {
		expect(isMultiQualityMode([])).toBe(false);
	});

	it('is false for a single bucket', () => {
		expect(isMultiQualityMode(['2160p'])).toBe(false);
	});

	it('is true for two or more buckets', () => {
		expect(isMultiQualityMode(['2160p', '1080p'])).toBe(true);
	});

	it('multi-quality minimum is 2', () => {
		expect(MULTI_QUALITY_MIN_BUCKETS).toBe(2);
	});
});

const file = (
	id: string,
	resolution: string | undefined,
	size = 100,
	path = `${id}.mkv`
): BucketFile => ({
	id,
	relativePath: path,
	quality: resolution ? { resolution } : null,
	size
});

describe('getFilledResolutions', () => {
	it('returns empty for no files', () => {
		expect(getFilledResolutions([])).toEqual([]);
	});

	it('returns unique resolutions present', () => {
		const files = [file('a', '2160p'), file('b', '1080p'), file('c', '2160p')];
		expect(getFilledResolutions(files)).toEqual(['2160p', '1080p']);
	});

	it('skips files with unknown or missing resolution', () => {
		const files = [file('a', 'unknown'), file('b', undefined), file('c', '1080p')];
		expect(getFilledResolutions(files)).toEqual(['1080p']);
	});
});

describe('unfilledBuckets', () => {
	it('returns all effective when nothing filled', () => {
		expect(unfilledBuckets(['2160p', '1080p'], [])).toEqual(['2160p', '1080p']);
	});

	it('subtracts filled resolutions', () => {
		expect(unfilledBuckets(['2160p', '1080p', '720p'], ['1080p'])).toEqual(['2160p', '720p']);
	});

	it('returns empty when all filled', () => {
		expect(unfilledBuckets(['2160p', '1080p'], ['2160p', '1080p'])).toEqual([]);
	});
});

describe('selectBestExistingFileInBucket', () => {
	it('returns undefined when no files in bucket', () => {
		expect(selectBestExistingFileInBucket([file('a', '1080p')], '2160p')).toBeUndefined();
	});

	it('returns the only file in bucket', () => {
		const f = file('a', '1080p');
		expect(selectBestExistingFileInBucket([f, file('b', '2160p')], '1080p')?.id).toBe('a');
	});

	it('prefers downloaded file over strm in same bucket', () => {
		const strm = file('a', '1080p', 2000, 'a.strm');
		const real = file('b', '1080p', 1000, 'b.mkv');
		expect(selectBestExistingFileInBucket([strm, real], '1080p')?.id).toBe('b');
	});

	it('prefers larger file among same kind', () => {
		const small = file('a', '1080p', 500);
		const big = file('b', '1080p', 5000);
		expect(selectBestExistingFileInBucket([small, big], '1080p')?.id).toBe('b');
	});
});

describe('selectBestFile', () => {
	it('returns undefined for no files', () => {
		expect(selectBestFile([])).toBeUndefined();
	});

	it('prefers higher resolution across buckets', () => {
		const f1080 = file('a', '1080p', 5000);
		const f4k = file('b', '2160p', 5000);
		expect(selectBestFile([f1080, f4k])?.id).toBe('b');
	});

	it('prefers downloaded over strm even if strm is higher resolution', () => {
		const strm4k = file('a', '2160p', 5000, 'a.strm');
		const real1080 = file('b', '1080p', 5000, 'b.mkv');
		expect(selectBestFile([strm4k, real1080])?.id).toBe('b');
	});
});

describe('fileIdsToReplace', () => {
	const all = [file('4k', '2160p'), file('1080', '1080p'), file('720', '720p')];

	it('returns all file ids in single-quality mode', () => {
		expect(fileIdsToReplace(all, '2160p', false).sort()).toEqual(['1080', '4k', '720']);
	});

	it('returns only same-resolution ids in multi-quality mode', () => {
		expect(fileIdsToReplace(all, '1080p', true)).toEqual(['1080']);
	});

	it('returns nothing when filling an empty bucket in multi-quality mode', () => {
		expect(fileIdsToReplace(all, '480p', true)).toEqual([]);
	});

	it('returns nothing in multi-quality mode when new resolution is undefined', () => {
		expect(fileIdsToReplace(all, undefined, true)).toEqual([]);
	});

	it('still replaces all in single-quality mode regardless of resolution', () => {
		expect(fileIdsToReplace(all, undefined, false).sort()).toEqual(['1080', '4k', '720']);
	});
});

describe('replaceIdsForImport', () => {
	const files = [file('4k', '2160p'), file('1080', '1080p'), file('720', '720p')];

	it('replaces only same-resolution files in multi-quality mode', () => {
		expect(
			replaceIdsForImport(files, { newResolution: '1080p', multiQuality: true, isUpgrade: true })
		).toEqual(['1080']);
	});

	it('replaces nothing in multi-quality mode when filling an empty bucket', () => {
		expect(
			replaceIdsForImport(files, { newResolution: '480p', multiQuality: true, isUpgrade: false })
		).toEqual([]);
	});

	it('replaces nothing in multi-quality mode even if isUpgrade when the bucket is empty', () => {
		expect(
			replaceIdsForImport(files, { newResolution: '480p', multiQuality: true, isUpgrade: true })
		).toEqual([]);
	});

	it('replaces all files in single-quality mode when isUpgrade', () => {
		expect(
			replaceIdsForImport(files, {
				newResolution: '2160p',
				multiQuality: false,
				isUpgrade: true
			}).sort()
		).toEqual(['1080', '4k', '720']);
	});

	it('replaces nothing in single-quality mode when not an upgrade', () => {
		expect(
			replaceIdsForImport(files, { newResolution: '2160p', multiQuality: false, isUpgrade: false })
		).toEqual([]);
	});
});
