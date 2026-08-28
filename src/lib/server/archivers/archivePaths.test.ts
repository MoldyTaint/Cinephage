import { describe, expect, it } from 'vitest';
import {
	archiveMediaTitle,
	movieArchiveDirectory,
	safeArchiveSegment,
	seasonArchiveDirectory
} from './archivePaths.js';

describe('archive paths', () => {
	it('uses the configured metadata title and sanitizes it for a remote directory', () => {
		expect(
			movieArchiveDirectory({
				title: 'Spider-Man: No Way Home',
				originalTitle: 'Original title',
				preferOriginalTitle: false
			})
		).toBe('Spider-Man_ No Way Home');
	});

	it('honors the preferred original title', () => {
		expect(
			archiveMediaTitle({
				title: 'Localized title',
				originalTitle: 'Original title',
				preferOriginalTitle: true
			})
		).toBe('Original title');
	});

	it('formats standard and specials season directories', () => {
		expect(seasonArchiveDirectory(0)).toBe('Season 00');
		expect(seasonArchiveDirectory(7)).toBe('Season 07');
		expect(seasonArchiveDirectory(12)).toBe('Season 12');
	});

	it('provides a safe fallback for invalid titles', () => {
		expect(safeArchiveSegment('...')).toBe('archive');
	});
});
