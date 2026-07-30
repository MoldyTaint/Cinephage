/**
 * Repair broken episode_files.episode_ids references.
 *
 * Symptom: ReconciliationService falls back to file-granularity rows (null
 * episode number) for episode files whose episode_ids point at UUIDs that no
 * longer exist in the episodes table. This happens when the episodes table is
 * regenerated (re-import / re-scan) and episode_files keeps stale UUIDs. The
 * visible effect is a storage maintenance insight reporting episodes as
 * "missing from media server" / "not tracked by Cinephage" that actually match.
 *
 * This script re-links episode_files.episode_ids by parsing the season/episode
 * numbers from each file's relative_path and looking up the current episode row
 * by (series_id, season_number, episode_number). It only touches files whose
 * current episode_ids are orphaned, and only updates when every parsed episode
 * resolves to exactly one episode row.
 *
 * Usage:
 *   node scripts/repair-episode-file-links.js              # dry-run (default)
 *   DRY_RUN=0 node scripts/repair-episode-file-links.js    # apply
 *   CINEPHAGE_DB_PATH=/path/cinephage.db node scripts/repair-episode-file-links.js
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';

const DRY_RUN = process.env.DRY_RUN !== '0' && process.env.DRY_RUN !== 'false';
const DB_PATH = resolveDbPath();

function resolveDbPath() {
	if (process.env.CINEPHAGE_DB_PATH) {
		return process.env.CINEPHAGE_DB_PATH;
	}
	if (process.env.DATA_DIR) {
		return join(process.env.DATA_DIR, 'cinephage.db');
	}
	if (existsSync('/config/data')) {
		return '/config/data/cinephage.db';
	}
	return 'data/cinephage.db';
}

function assertDbPath(dbPath) {
	const dir = dirname(dbPath);
	if (!existsSync(dir)) {
		throw new Error(
			`Database directory does not exist: ${dir}. Set CINEPHAGE_DB_PATH or DATA_DIR.`
		);
	}
	if (!existsSync(dbPath)) {
		const hint =
			process.env.CINEPHAGE_DB_PATH || process.env.DATA_DIR
				? 'Check CINEPHAGE_DB_PATH or DATA_DIR.'
				: 'If running in Docker, set CINEPHAGE_DB_PATH=/config/data/cinephage.db.';
		throw new Error(`Database not found at ${dbPath}. ${hint}`);
	}
}

function parseEpisodeIds(value) {
	if (!value) return [];
	if (Array.isArray(value)) return value;
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

/**
 * Extract the season and one-or-more episode numbers from a file path.
 * Recognises S01E01, S01E01-E02, S01E01-02, and S01E01E02 forms. Returns null
 * when no season/episode marker is present (the file can't be repaired by name).
 */
function parseSeasonEpisode(relativePath) {
	const filename = relativePath.split('/').pop() ?? relativePath;
	const marker = filename.match(/s(\d+)\s*e(\d+)/i);
	if (!marker) return null;
	const season = parseInt(marker[1], 10);
	const firstEp = parseInt(marker[2], 10);
	const episodes = [firstEp];

	const rest = filename.slice(marker.index + marker[0].length);

	// Range form: "-E02" or "-02" immediately after the marker.
	const range = rest.match(/^\s*-\s*(?:e)?(\d+)/i);
	if (range) {
		const last = parseInt(range[1], 10);
		if (last > firstEp) {
			for (let e = firstEp + 1; e <= last; e++) episodes.push(e);
			return { season, episodes };
		}
	}

	// Multi-episode form: "E02E03" with no separator immediately after the marker.
	const multi = rest.match(/^(?:e(\d+))+/i);
	if (multi) {
		const re = /e(\d+)/gi;
		let m;
		while ((m = re.exec(rest)) !== null) {
			const n = parseInt(m[1], 10);
			if (!episodes.includes(n)) episodes.push(n);
		}
	}

	return { season, episodes };
}

function main() {
	assertDbPath(DB_PATH);
	const db = new Database(DB_PATH);

	const episodeExistsStmt = db.prepare('SELECT 1 FROM episodes WHERE id = ? LIMIT 1');
	const episodesByNumberStmt = db.prepare(
		'SELECT id, episode_number FROM episodes WHERE series_id = ? AND season_number = ? AND episode_number = ? LIMIT 2'
	);

	const allFiles = db
		.prepare('SELECT id, series_id, season_number, episode_ids, relative_path FROM episode_files')
		.all();

	let checked = 0;
	let orphaned = 0;
	let repaired = 0;
	let skippedNoMarker = 0;
	let skippedUnresolved = 0;
	const samples = [];
	const SAMPLE_LIMIT = 20;

	for (const file of allFiles) {
		checked += 1;
		const ids = parseEpisodeIds(file.episode_ids);
		if (ids.length === 0) continue;

		// Is the linkage already healthy? (all referenced ids exist)
		const orphans = ids.filter((id) => !episodeExistsStmt.get(id));
		if (orphans.length === 0) continue;

		orphaned += 1;

		const parsed = parseSeasonEpisode(file.relative_path);
		if (!parsed) {
			skippedNoMarker += 1;
			if (samples.length < SAMPLE_LIMIT) {
				samples.push({
					episodeFileId: file.id,
					reason: 'no SxxExx marker in relative_path',
					relativePath: file.relative_path
				});
			}
			continue;
		}

		// Resolve every parsed episode number to exactly one episode row.
		const newIds = [];
		let resolvedAll = true;
		for (const epNum of parsed.episodes) {
			const rows = episodesByNumberStmt.all(file.series_id, parsed.season, epNum);
			if (rows.length !== 1) {
				resolvedAll = false;
				break;
			}
			newIds.push(rows[0].id);
		}

		if (!resolvedAll || newIds.length === 0) {
			skippedUnresolved += 1;
			if (samples.length < SAMPLE_LIMIT) {
				samples.push({
					episodeFileId: file.id,
					reason: `parsed S${parsed.season}E${parsed.episodes.join(',')} did not resolve 1:1 to episodes`,
					relativePath: file.relative_path
				});
			}
			continue;
		}

		if (!DRY_RUN) {
			db.prepare('UPDATE episode_files SET episode_ids = ? WHERE id = ?').run(
				JSON.stringify(newIds),
				file.id
			);
		}
		repaired += 1;
	}

	const summary = {
		checked,
		orphaned,
		repaired,
		skippedNoMarker,
		skippedUnresolved,
		dryRun: DRY_RUN
	};
	console.log('[repair-episode-file-links] Completed', summary);
	if (samples.length > 0) {
		console.log('[repair-episode-file-links] Unrepaired samples:');
		for (const s of samples) {
			console.log(`- ${s.episodeFileId}: ${s.reason}`);
			console.log(`    relative_path: ${s.relativePath}`);
		}
	}
}

main();
