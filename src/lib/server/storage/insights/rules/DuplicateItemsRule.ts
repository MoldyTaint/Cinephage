import { sql } from 'drizzle-orm';
import { movieFiles, movies } from '$lib/server/db/schema';
import type { StorageInsightRule, RuleContext, InsightFinding } from '../types.js';

/**
 * Detects movies with multiple movie_files rows pointing to the same tmdbId AND
 * the same resolution. A movie with files at DIFFERENT resolutions (multi-quality
 * mode) is intentional and is NOT a duplicate. A genuine duplicate is two or more
 * files at the SAME resolution (e.g. two 1080p encodes) that the user may want to
 * clean up.
 *
 * Episode duplicate detection is deferred — it requires comparing
 * episodeIds JSON arrays across episode_files to find overlapping
 * episode coverage, which is non-trivial in SQLite.
 */
export class DuplicateItemsRule implements StorageInsightRule {
	readonly type = 'duplicate-items' as const;

	async evaluate(ctx: RuleContext): Promise<InsightFinding[]> {
		type MovieFileRow = {
			movieId: string;
			tmdbId: number | null;
			title: string | null;
			quality: unknown;
		};

		const rows = ctx.db
			.select({
				movieId: movies.id,
				tmdbId: movies.tmdbId,
				title: movies.title,
				quality: movieFiles.quality
			})
			.from(movies)
			.innerJoin(movieFiles, sql`${movieFiles.movieId} = ${movies.id}`)
			.where(sql`${movies.tmdbId} IS NOT NULL`)
			.all() as MovieFileRow[];

		// Group files per movie into resolution buckets. A movie is a duplicate
		// only when at least one resolution bucket contains more than one file.
		const movieMap = new Map<
			string,
			{
				tmdbId: number | null;
				title: string | null;
				buckets: Map<string, number>;
			}
		>();

		for (const row of rows) {
			const resolution = (row.quality as { resolution?: string } | null)?.resolution ?? 'unknown';
			let entry = movieMap.get(row.movieId);
			if (!entry) {
				entry = { tmdbId: row.tmdbId, title: row.title, buckets: new Map() };
				movieMap.set(row.movieId, entry);
			}
			entry.buckets.set(resolution, (entry.buckets.get(resolution) ?? 0) + 1);
		}

		const duplicates = [...movieMap.values()]
			.map((entry) => {
				// fileCount is the max same-resolution dup count (not total files); name kept for frontend.
				const maxSameResolution = Math.max(...entry.buckets.values());
				return {
					tmdbId: entry.tmdbId,
					title: entry.title,
					fileCount: maxSameResolution
				};
			})
			.filter((d) => d.fileCount > 1);

		if (duplicates.length === 0) return [];

		const totalDupes = duplicates.length;
		return [
			{
				type: this.type,
				severity: 'warning',
				scope: 'global',
				title: `Duplicate items`,
				summary: `${totalDupes} movie${totalDupes === 1 ? ' has' : 's have'} multiple files. You may want to remove duplicates to reclaim space.`,
				details: {
					items: duplicates.map((d) => ({
						tmdbId: d.tmdbId,
						title: d.title,
						fileCount: d.fileCount
					}))
				},
				itemCount: totalDupes
			}
		];
	}
}
