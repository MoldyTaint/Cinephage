import { existsSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const MISSING_SAMPLE_LIMIT = parseInt(process.env.MISSING_SAMPLE_LIMIT || '5', 10) || 5;
const DB_PATH = resolveDbPath();

function resolveDbPath() {
	if (process.env.CINEPHAGE_DB_PATH) {
		return process.env.CINEPHAGE_DB_PATH;
	}
	if (process.env.DATA_DIR) {
		return join(process.env.DATA_DIR, 'cinephage.db');
	}
	// Prefer Docker default if present
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

function resolveEpisodeMediaDir(rootPath, seriesPath, fileRelativePath) {
	const seriesRel = (seriesPath ?? '').replace(/^[/\\]+/, '');
	let fileDir = dirname(fileRelativePath).replace(/^[/\\]+/, '');

	if (seriesRel && !(fileDir === seriesRel || fileDir.startsWith(`${seriesRel}/`))) {
		fileDir = join(seriesRel, fileDir);
	}

	return join(rootPath, fileDir);
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

async function main() {
	assertDbPath(DB_PATH);
	const db = new Database(DB_PATH);

	const subtitleRows = db
		.prepare('SELECT id, episode_id, relative_path FROM subtitles WHERE episode_id IS NOT NULL')
		.all();

	const episodeStmt = db.prepare('SELECT id, series_id FROM episodes WHERE id = ? LIMIT 1');
	const seriesStmt = db.prepare('SELECT id, path, root_folder_id FROM series WHERE id = ? LIMIT 1');
	const rootStmt = db.prepare('SELECT path FROM root_folders WHERE id = ? LIMIT 1');
	const filesStmt = db.prepare(
		'SELECT relative_path, episode_ids FROM episode_files WHERE series_id = ?'
	);

	let checked = 0;
	let moved = 0;
	let skipped = 0;
	let missing = 0;
	const missingSamples = [];

	for (const subtitle of subtitleRows) {
		checked += 1;
		const episodeId = subtitle.episode_id;
		if (!episodeId) {
			skipped += 1;
			continue;
		}

		const episode = episodeStmt.get(episodeId);
		if (!episode) {
			skipped += 1;
			continue;
		}

		const series = seriesStmt.get(episode.series_id);
		if (!series) {
			skipped += 1;
			continue;
		}

		const rootFolder = series.root_folder_id ? rootStmt.get(series.root_folder_id) : null;
		const rootPath = rootFolder?.path ?? '';

		const files = filesStmt.all(series.id);
		const file = files.find((f) => {
			const ids = parseEpisodeIds(f.episode_ids);
			return ids.includes(episodeId);
		});
		if (!file) {
			skipped += 1;
			continue;
		}

		const currentDir = join(rootPath, dirname(file.relative_path));
		const correctDir = resolveEpisodeMediaDir(rootPath, series.path, file.relative_path);

		if (currentDir === correctDir) {
			skipped += 1;
			continue;
		}

		const fileName = subtitle.relative_path;
		const currentPath = join(currentDir, fileName);
		const correctPath = join(correctDir, fileName);

		if (existsSync(correctPath)) {
			skipped += 1;
			continue;
		}
		if (!existsSync(currentPath)) {
			missing += 1;
			if (missingSamples.length < MISSING_SAMPLE_LIMIT) {
				missingSamples.push({ id: subtitle.id, currentPath, correctPath });
			}
			continue;
		}

		if (!DRY_RUN) {
			await mkdir(correctDir, { recursive: true });
			await rename(currentPath, correctPath);
		}

		moved += 1;
	}

	const summary = { checked, moved, skipped, missing, dryRun: DRY_RUN };
	console.log('[fix-tv-subtitle-paths] Completed', summary);
	if (missingSamples.length > 0) {
		console.log('[fix-tv-subtitle-paths] Missing samples:');
		for (const sample of missingSamples) {
			console.log(`- id=${sample.id} current=${sample.currentPath} correct=${sample.correctPath}`);
		}
	}
}

main().catch((error) => {
	console.error('[fix-tv-subtitle-paths] Failed', error);
	process.exitCode = 1;
});
