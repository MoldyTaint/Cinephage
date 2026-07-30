import { sql } from 'drizzle-orm';
import type { StorageInsightRule, RuleContext, InsightFinding } from '../types.js';

/**
 * Detects duplicate files by normalized filename signature.
 * Uses the same normalizeFilename() logic as DuplicateDetectionService
 * but operates on the reconciled storage_items view for scaling.
 *
 * Finds files where the normalized stem matches (case-insensitive,
 * whitespace/collapsed separators) across different DB rows.
 */
export class FilenameDuplicateRule implements StorageInsightRule {
	readonly type = 'filename-duplicates' as const;

	async evaluate(ctx: RuleContext): Promise<InsightFinding[]> {
		// Find movies with duplicate filename signatures within the same library
		const movieDupes = ctx.db.all<{
			libraryId: string;
			libraryName: string;
			signature: string;
			title: string;
			fileCount: number;
		}>(
			sql`
					SELECT 
						l.id AS libraryId, l.name AS libraryName,
						LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
							mf.relative_path, '.', ' '), '-', ' '), '_', ' '), '(', ' '), ')', ' '
						)) AS signature,
						m.title, COUNT(*) AS fileCount
					FROM movie_files mf
					JOIN movies m ON mf.movie_id = m.id
					JOIN libraries l ON m.library_id = l.id
					WHERE mf.relative_path IS NOT NULL
					GROUP BY l.id, signature
					HAVING COUNT(*) > 1
					LIMIT 100
				`
		);

		const episodeDupes = ctx.db.all<{
			libraryId: string;
			libraryName: string;
			signature: string;
			title: string;
			fileCount: number;
		}>(
			sql`
					SELECT 
						l.id AS libraryId, l.name AS libraryName,
						LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
							ef.relative_path, '.', ' '), '-', ' '), '_', ' '), '(', ' '), ')', ' '
						)) AS signature,
						COALESCE(s.title, 'Unknown Series') AS title,
						COUNT(*) AS fileCount
					FROM episode_files ef
					JOIN series s ON ef.series_id = s.id
					JOIN libraries l ON s.library_id = l.id
					WHERE ef.relative_path IS NOT NULL
					GROUP BY l.id, signature
					HAVING COUNT(*) > 1
					LIMIT 100
				`
		);

		const allDupes = [...movieDupes, ...episodeDupes];
		if (allDupes.length === 0) return [];

		// Group by library
		const byLibrary = new Map<string, Array<(typeof allDupes)[number]>>();
		for (const d of allDupes) {
			const list = byLibrary.get(d.libraryId) ?? [];
			list.push(d);
			byLibrary.set(d.libraryId, list);
		}

		return [...byLibrary.entries()].map(([libraryId, items]) => ({
			type: this.type,
			severity: 'info' as const,
			scope: 'library' as const,
			scopeId: libraryId,
			title: `Filename duplicates`,
			summary: `${items.length} filename group${items.length === 1 ? '' : 's'} with duplicate signatures in ${items[0].libraryName}.`,
			details: {
				items: items.map((d) => ({
					signature: d.signature.trim().replace(/\s+/g, ' '),
					title: d.title,
					fileCount: d.fileCount
				}))
			},
			itemCount: items.length
		}));
	}
}
