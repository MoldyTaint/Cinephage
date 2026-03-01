import { describe, expect, it } from 'vitest';
import { getLibraryRelativePath } from './media-paths.js';

describe('getLibraryRelativePath', () => {
	it('returns movie file paths relative to the movie folder', () => {
		const relativePath = getLibraryRelativePath(
			'/media/movies',
			'The Interview (2014) [tmdbid-228967]',
			'/media/movies/The Interview (2014) [tmdbid-228967]/The Interview (2014).strm'
		);

		expect(relativePath).toBe('The Interview (2014).strm');
	});

	it('returns episode file paths relative to the series folder', () => {
		const relativePath = getLibraryRelativePath(
			'/media/tv',
			'Show Name (2024) [tvdbid-12345]',
			'/media/tv/Show Name (2024) [tvdbid-12345]/Season 01/Show Name - S01E01.strm'
		);

		expect(relativePath).toBe('Season 01/Show Name - S01E01.strm');
	});
});
