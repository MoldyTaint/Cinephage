export interface ArchiveTitleMetadata {
	title: string;
	originalTitle?: string | null;
	preferOriginalTitle?: boolean | null;
}

export function archiveMediaTitle(metadata: ArchiveTitleMetadata): string {
	return metadata.preferOriginalTitle && metadata.originalTitle
		? metadata.originalTitle
		: metadata.title;
}

export function safeArchiveSegment(value: string): string {
	return (
		value
			.replace(/[\\/:*?"<>|]/g, '_')
			.replace(/^\.+|\.+$/g, '')
			.trim() || 'archive'
	);
}

export function movieArchiveDirectory(metadata: ArchiveTitleMetadata): string {
	return safeArchiveSegment(archiveMediaTitle(metadata));
}

export function seriesArchiveDirectory(metadata: ArchiveTitleMetadata): string {
	return safeArchiveSegment(archiveMediaTitle(metadata));
}

export function seasonArchiveDirectory(seasonNumber: number): string {
	return `Season ${String(seasonNumber).padStart(2, '0')}`;
}

export function movieArchiveFilePath(sourceRelativePath: string): string {
	return basename(sourceRelativePath);
}

export function seriesArchiveFilePath(sourceRelativePath: string, seasonNumber: number): string {
	return join(seasonArchiveDirectory(seasonNumber), basename(sourceRelativePath));
}
import { basename, join } from 'node:path';
