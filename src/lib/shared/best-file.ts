/**
 * Client-safe (no server imports) ranking mirror of the server
 * {@link import('$lib/server/quality/buckets.js').selectBestFile}. Used by
 * client-side code (types, utils, Svelte components) that cannot import the
 * server helper directly.
 *
 * Keep RESOLUTION_RANK in sync with RESOLUTION_ORDER in
 * `src/lib/server/indexers/parser/types.ts` and scoreFile() in sync with
 * overallScore() in `src/lib/server/quality/buckets.ts`.
 */
const RESOLUTION_RANK: Record<string, number> = {
	'2160p': 4,
	'1080p': 3,
	'720p': 2,
	'480p': 1
};

export interface RankableMovieFile {
	relativePath: string;
	quality?: { resolution?: string } | null;
	size?: number | null;
}

/**
 * Pick the representative "best" movie file: prefer downloaded (non-.strm),
 * then higher resolution, then larger size. Returns undefined for empty input.
 */
export function pickBestMovieFile<T extends RankableMovieFile>(
	files: T[] | null | undefined
): T | undefined {
	if (!files || files.length === 0) return undefined;
	let best = files[0];
	let bestScore = scoreFile(best);
	for (let i = 1; i < files.length; i++) {
		const s = scoreFile(files[i]);
		if (s > bestScore) {
			best = files[i];
			bestScore = s;
		}
	}
	return best;
}

function scoreFile(f: RankableMovieFile): number {
	const isStrm = f.relativePath?.toLowerCase().endsWith('.strm') ?? false;
	const typeBonus = isStrm ? 0 : 10_000;
	const resRank = RESOLUTION_RANK[f.quality?.resolution ?? 'unknown'] ?? 0;
	const sizeMb = (f.size ?? 0) / (1024 * 1024);
	return typeBonus + resRank * 1000 + Math.min(sizeMb, 100);
}
