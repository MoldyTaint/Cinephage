import { describe, expect, it } from 'vitest';
import { getWritableRootFoldersForMediaType } from './root-folders.js';

describe('getWritableRootFoldersForMediaType', () => {
	const folders = [
		{
			id: 'read-only',
			name: 'Read only movies',
			mediaType: 'movie',
			readOnly: true,
			isDefault: true
		},
		{
			id: 'writable-b',
			name: 'Writable B',
			mediaType: 'movie',
			readOnly: false,
			isDefault: false
		},
		{
			id: 'writable-a',
			name: 'Writable A',
			mediaType: 'movie',
			readOnly: false,
			isDefault: true
		},
		{
			id: 'tv-folder',
			name: 'TV',
			mediaType: 'tv',
			readOnly: false,
			isDefault: true
		}
	];

	it('excludes read-only folders before applying media type sorting', () => {
		const result = getWritableRootFoldersForMediaType(folders, 'movie');

		expect(result.map((folder) => folder.id)).toEqual(['writable-a', 'writable-b']);
	});

	it('filters by the required media subtype', () => {
		const result = getWritableRootFoldersForMediaType(
			[
				{ ...folders[2], mediaSubType: 'standard' },
				{ ...folders[2], id: 'anime', name: 'Anime', mediaSubType: 'anime' },
				{ ...folders[0], id: 'read-only-anime', mediaSubType: 'anime' }
			],
			'movie',
			'anime'
		);

		expect(result.map((folder) => folder.id)).toEqual(['anime']);
	});
});
