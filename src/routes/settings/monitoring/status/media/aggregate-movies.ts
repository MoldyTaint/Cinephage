import { selectBestFile, type BucketFile } from '$lib/server/quality/buckets.js';

export interface MovieJoinedRow {
	id: string;
	tmdbId: number | null;
	title: string;
	year: number | null;
	libraryId: string | null;
	rootFolderId: string | null;
	monitored: boolean | null;
	hasFile: boolean | null;
	added: string | null;
	posterPath: string | null;
	// per-file fields (one row per movieFile):
	fileId: string | null;
	fileSize: number | null;
	quality: unknown;
	mediaInfo: unknown;
	relativePath: string | null;
}

export interface AggregatedMovie extends Omit<
	MovieJoinedRow,
	'fileId' | 'fileSize' | 'quality' | 'mediaInfo' | 'relativePath'
> {
	totalFileSize: number;
	bestQuality: unknown;
	bestMediaInfo: unknown;
}

/**
 * Group joined movie x movieFile rows into one record per movie: sum every
 * file's size, and keep the quality/mediaInfo of the best file (via
 * {@link selectBestFile} ranking: downloaded over .strm, then resolution,
 * then size). Movies with no file rows get null quality/mediaInfo and size 0.
 */
export function aggregateMovieRows(rows: MovieJoinedRow[]): AggregatedMovie[] {
	const groups = new Map<string, MovieJoinedRow[]>();
	for (const row of rows) {
		let group = groups.get(row.id);
		if (!group) {
			group = [];
			groups.set(row.id, group);
		}
		group.push(row);
	}

	const result: AggregatedMovie[] = [];
	for (const group of groups.values()) {
		const first = group[0];

		const bucketFiles: BucketFile[] = [];
		for (const row of group) {
			if (row.fileId === null) continue;
			bucketFiles.push({
				id: row.fileId,
				relativePath: row.relativePath ?? '',
				quality: row.quality as { resolution?: string } | null,
				size: row.fileSize
			});
		}

		const best = selectBestFile(bucketFiles);
		const bestRow = best ? group.find((r) => r.fileId === best.id) : undefined;

		let totalFileSize = 0;
		for (const row of group) {
			totalFileSize += row.fileSize ?? 0;
		}

		result.push({
			id: first.id,
			tmdbId: first.tmdbId,
			title: first.title,
			year: first.year,
			libraryId: first.libraryId,
			rootFolderId: first.rootFolderId,
			monitored: first.monitored,
			hasFile: first.hasFile,
			added: first.added,
			posterPath: first.posterPath,
			totalFileSize,
			bestQuality: bestRow?.quality ?? null,
			bestMediaInfo: bestRow?.mediaInfo ?? null
		});
	}

	return result;
}
