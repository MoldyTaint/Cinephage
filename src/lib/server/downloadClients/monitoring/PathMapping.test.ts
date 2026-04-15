import { describe, it, expect } from 'vitest';
import {
	mapClientPathToLocal,
	mapClientPathToLocalWithResult,
	needsPathMapping
} from './PathMapping';

describe('PathMapping windows separator handling', () => {
	it('maps Windows client paths with backslashes to Linux local paths', () => {
		const mapped = mapClientPathToLocal(
			'D:\\Torrent\\www.UIndex.org - The Simpsons S37E01',
			'/downloads',
			'D:\\Torrent'
		);

		expect(mapped).toBe('/downloads/www.UIndex.org - The Simpsons S37E01');
	});

	it('strips a leading backslash in the relative path after prefix removal', () => {
		const mapped = mapClientPathToLocal('D:\\Torrent\\filename.mkv', '/downloads', 'D:\\Torrent');
		expect(mapped).toBe('/downloads/filename.mkv');
	});

	it('maps Windows-style paths in detailed mapping mode', () => {
		const result = mapClientPathToLocalWithResult('D:\\Torrent\\Show\\Episode.mkv', {
			completeLocalPath: '/downloads',
			completeRemotePath: 'D:\\Torrent'
		});

		expect(result).toEqual({
			path: '/downloads/Show/Episode.mkv',
			exact: true
		});
	});

	it('treats slash style differences as already local in needsPathMapping', () => {
		expect(needsPathMapping('\\downloads\\Show\\Episode.mkv', '/downloads')).toBe(false);
	});
});
