import { join, relative } from 'node:path';

/**
 * Return the file path relative to the media item's library folder.
 * Movie files are stored relative to the movie folder, and episode files
 * are stored relative to the series folder.
 */
export function getLibraryRelativePath(
	rootFolderPath: string,
	mediaPath: string | null | undefined,
	filePath: string
): string {
	return relative(join(rootFolderPath, mediaPath ?? ''), filePath);
}
