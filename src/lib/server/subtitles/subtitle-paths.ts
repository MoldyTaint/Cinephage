/**
 * Stored subtitle path resolution.
 *
 * Single source of truth for turning a `subtitles` row into the absolute path
 * of its file on disk. Used by download/delete (SubtitleDownloadService) and by
 * status disk verification (LanguageProfileService), so the base directory rules
 * cannot drift between them:
 *
 * - movie rows are relative to the movie folder:
 *     join(rootFolder.path, movie.path, row.relativePath)
 * - episode rows are relative to the directory of the owning episode file
 *   (which includes the season folder when the library uses one):
 *     join(rootFolder.path, series.path, dirname(episodeFile.relativePath), row.relativePath)
 *
 * Any missing owner (movie/episode/series/root folder/episode file) resolves to
 * null; callers must treat null as "cannot verify on disk".
 *
 * NOTE (Phase 3 Task 5): SubtitleSyncService still builds its own subtitle path
 * plus a paired video path in one query pass. It is intentionally left alone
 * here to avoid a behavior change (its episode no-file fallback and its
 * multi-quality video lookup); Task 5 unifies it on these helpers.
 */

import { db } from '$lib/server/db';
import {
	episodeFiles,
	episodes,
	movies,
	rootFolders,
	series,
	subtitles
} from '$lib/server/db/schema';
import { inArray } from 'drizzle-orm';
import { dirname, join, relative } from 'node:path';

/** A row from the `subtitles` table. */
export type StoredSubtitleRow = typeof subtitles.$inferSelect;

/**
 * Inverse of the resolution rules: derive the value to store in
 * `subtitles.relative_path` for a sidecar at `absPath` given the base directory
 * the row will later be resolved against.
 *
 * - movie rows: `mediaDirAbs` is the absolute movie folder.
 * - episode rows: `mediaDirAbs` is the absolute directory of the owning episode
 *   file (which includes the season folder when the library uses one):
 *     toStoredRelativePath(sub.path, join(rootFolder.path, series.path, dirname(episodeFile.relativePath)))
 *
 * Separators are always normalized to `/` so stored values match migration 138's
 * rewrite and stay filesystem independent. The scanner (writer) and
 * `resolveStoredSubtitlePath` (reader) therefore share one definition of the
 * base, preventing the drift that previously left scanner episode rows dangling.
 *
 * Callers must pass the correct base; a path outside it yields a `../`-prefixed
 * value rather than an error.
 */
export function toStoredRelativePath(absPath: string, mediaDirAbs: string): string {
	return relative(mediaDirAbs, absPath)
		.split(/[\\/]+/)
		.join('/');
}

/**
 * Resolve the absolute path for a single stored subtitle row.
 * Returns null when the owner cannot be resolved.
 */
export async function resolveStoredSubtitlePath(row: StoredSubtitleRow): Promise<string | null> {
	const resolved = await resolveStoredSubtitlePaths([row]);
	return resolved.get(row.id) ?? null;
}

/**
 * Batch-resolve absolute paths for stored subtitle rows with a single set of DB
 * queries (no N+1). Rows that cannot be resolved map to null.
 */
export async function resolveStoredSubtitlePaths(
	rows: StoredSubtitleRow[]
): Promise<Map<string, string | null>> {
	const result = new Map<string, string | null>();
	if (rows.length === 0) return result;

	const movieIds = uniqueStrings(rows.map((row) => row.movieId));
	const episodeIds = uniqueStrings(rows.map((row) => row.episodeId));

	const movieRows = movieIds.length
		? await db.select().from(movies).where(inArray(movies.id, movieIds))
		: [];
	const episodeRows = episodeIds.length
		? await db.select().from(episodes).where(inArray(episodes.id, episodeIds))
		: [];

	const movieById = new Map(movieRows.map((row) => [row.id, row]));
	const episodeById = new Map(episodeRows.map((row) => [row.id, row]));

	const seriesIds = uniqueStrings(episodeRows.map((row) => row.seriesId));
	const seriesRows = seriesIds.length
		? await db.select().from(series).where(inArray(series.id, seriesIds))
		: [];
	const seriesById = new Map(seriesRows.map((row) => [row.id, row]));

	const fileRows = seriesIds.length
		? await db.select().from(episodeFiles).where(inArray(episodeFiles.seriesId, seriesIds))
		: [];
	const filesBySeries = new Map<string, typeof fileRows>();
	for (const file of fileRows) {
		const list = filesBySeries.get(file.seriesId);
		if (list) list.push(file);
		else filesBySeries.set(file.seriesId, [file]);
	}

	const rootFolderIds = uniqueStrings([
		...movieRows.map((row) => row.rootFolderId),
		...seriesRows.map((row) => row.rootFolderId)
	]);
	const rootFolderRows = rootFolderIds.length
		? await db.select().from(rootFolders).where(inArray(rootFolders.id, rootFolderIds))
		: [];
	const rootFolderById = new Map(rootFolderRows.map((row) => [row.id, row]));

	for (const row of rows) {
		result.set(row.id, resolveRow(row));
	}

	return result;

	function resolveRow(row: StoredSubtitleRow): string | null {
		if (row.movieId) {
			const movie = movieById.get(row.movieId);
			if (!movie || !movie.rootFolderId) return null;

			const rootFolder = rootFolderById.get(movie.rootFolderId);
			if (!rootFolder) return null;

			return join(rootFolder.path, movie.path, row.relativePath);
		}

		if (row.episodeId) {
			const episode = episodeById.get(row.episodeId);
			if (!episode) return null;

			const seriesRow = seriesById.get(episode.seriesId);
			if (!seriesRow || !seriesRow.rootFolderId) return null;

			const rootFolder = rootFolderById.get(seriesRow.rootFolderId);
			if (!rootFolder) return null;

			const candidates = (filesBySeries.get(seriesRow.id) ?? []).filter((file) =>
				(file.episodeIds as string[] | null)?.includes(row.episodeId!)
			);
			if (candidates.length === 0) return null;

			// A subtitle row has no episode-file link; `movieFileId` is only ever set
			// for movie rows. Prefer a candidate with a matching id (defensive), then
			// fall back to a deterministic order so repeated calls agree.
			const file =
				(row.movieFileId
					? candidates.find((candidate) => candidate.id === row.movieFileId)
					: undefined) ?? sortByPath(candidates)[0];

			return join(rootFolder.path, seriesRow.path, dirname(file.relativePath), row.relativePath);
		}

		return null;
	}
}

/** Sort episode-file candidates deterministically by relative path then id. */
function sortByPath<T extends { relativePath: string; id: string }>(files: T[]): T[] {
	return [...files].sort((a, b) =>
		a.relativePath === b.relativePath
			? a.id.localeCompare(b.id)
			: a.relativePath.localeCompare(b.relativePath)
	);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
	return [...new Set(values.filter((value): value is string => typeof value === 'string'))];
}
