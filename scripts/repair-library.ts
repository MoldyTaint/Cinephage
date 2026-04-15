/**
 * Library Repair Script
 *
 * Fixes data integrity issues in the Cinephage database:
 * 1.  Removes duplicate episode_files (keeps newest by date_added)
 * 1B. Removes duplicate movie_files (keeps newest by date_added)
 * 2.  Processes unmatched_files in known series folders → creates episode_files
 * 3.  Resets all episode hasFile flags based on actual episode_files
 * 4.  Recalculates all series.episode_file_count
 * 5.  Recalculates all seasons.episode_file_count
 * 6.  Recalculates all movies.hasFile flags based on actual movie_files
 * 7.  Removes duplicate download_queue entries (same download)
 * 8.  Deletes imported/removed download_queue entries
 * 9.  Fetches missing external IDs (IMDB/TVDB) from TMDB for movies/series
 *
 * Usage: npx tsx scripts/repair-library.ts
 */

import { db } from '../src/lib/server/db/index.js';
import {
	episodeFiles,
	episodes,
	series,
	seasons,
	unmatchedFiles,
	downloadQueue,
	rootFolders,
	movieFiles,
	movies
} from '../src/lib/server/db/schema.js';
import { eq, and, inArray, ne } from 'drizzle-orm';
import { basename, relative, join } from 'path';

// Parse season/episode from filename
function parseSeasonEpisode(filename: string): { season: number; episode: number } | null {
	// Match patterns like S01E02, S1E2, 1x02, etc.
	const patterns = [
		/[Ss](\d{1,2})[Ee](\d{1,3})/, // S01E02
		/(\d{1,2})x(\d{1,3})/, // 1x02
		/[Ss]eason\s*(\d{1,2}).*[Ee]pisode\s*(\d{1,3})/i // Season 1 Episode 2
	];

	for (const pattern of patterns) {
		const match = filename.match(pattern);
		if (match) {
			return { season: parseInt(match[1], 10), episode: parseInt(match[2], 10) };
		}
	}
	return null;
}

async function main() {
	console.log('🔧 Starting Library Repair...\n');

	let totalFixed = 0;

	// =====================================================
	// Step 1: Remove duplicate episode_files
	// =====================================================
	console.log('📁 Step 1: Removing duplicate episode_files...');

	// Find all duplicates grouped by series_id + relative_path
	const allFiles = await db.select().from(episodeFiles);
	const fileGroups = new Map<string, typeof allFiles>();

	for (const file of allFiles) {
		const key = `${file.seriesId}::${file.relativePath}`;
		const existing = fileGroups.get(key) || [];
		existing.push(file);
		fileGroups.set(key, existing);
	}

	let duplicatesRemoved = 0;
	for (const [, files] of fileGroups) {
		if (files.length > 1) {
			// Sort by dateAdded descending (newest first), keep the first
			files.sort((a, b) => {
				const dateA = a.dateAdded ? new Date(a.dateAdded).getTime() : 0;
				const dateB = b.dateAdded ? new Date(b.dateAdded).getTime() : 0;
				return dateB - dateA;
			});

			// Delete all but the newest
			const toDelete = files.slice(1);
			for (const file of toDelete) {
				await db.delete(episodeFiles).where(eq(episodeFiles.id, file.id));
				duplicatesRemoved++;
			}
		}
	}
	console.log(`   ✅ Removed ${duplicatesRemoved} duplicate episode_files\n`);
	totalFixed += duplicatesRemoved;

	// =====================================================
	// Step 1B: Remove duplicate movie_files
	// =====================================================
	console.log('🎬 Step 1B: Removing duplicate movie_files...');

	const allMovieFiles = await db.select().from(movieFiles);
	const movieFileGroups = new Map<string, typeof allMovieFiles>();

	for (const file of allMovieFiles) {
		const key = `${file.movieId}::${file.relativePath}`;
		const existing = movieFileGroups.get(key) || [];
		existing.push(file);
		movieFileGroups.set(key, existing);
	}

	let movieDuplicatesRemoved = 0;
	for (const [, files] of movieFileGroups) {
		if (files.length > 1) {
			// Sort by dateAdded descending (newest first), keep the first
			files.sort((a, b) => {
				const dateA = a.dateAdded ? new Date(a.dateAdded).getTime() : 0;
				const dateB = b.dateAdded ? new Date(b.dateAdded).getTime() : 0;
				return dateB - dateA;
			});

			// Delete all but the newest
			const toDelete = files.slice(1);
			for (const file of toDelete) {
				await db.delete(movieFiles).where(eq(movieFiles.id, file.id));
				movieDuplicatesRemoved++;
			}

			if (files.length > 2) {
				console.log(`   ⚠️  Movie had ${files.length} duplicates: ${files[0].relativePath}`);
			}
		}
	}
	console.log(`   ✅ Removed ${movieDuplicatesRemoved} duplicate movie_files\n`);
	totalFixed += movieDuplicatesRemoved;

	// =====================================================
	// Step 2: Process unmatched_files in known series folders
	// =====================================================
	console.log('📂 Step 2: Linking unmatched files in series folders...');

	// Get all series with their root folders
	const allSeries = await db
		.select({
			id: series.id,
			path: series.path,
			rootFolderId: series.rootFolderId,
			seasonFolder: series.seasonFolder
		})
		.from(series);

	// Get all root folders
	const allRootFolders = await db.select().from(rootFolders);
	const rootFolderMap = new Map(allRootFolders.map((rf) => [rf.id, rf]));

	// Build a map of series full paths
	const seriesPathMap = new Map<string, (typeof allSeries)[0]>();
	for (const s of allSeries) {
		if (s.rootFolderId) {
			const rf = rootFolderMap.get(s.rootFolderId);
			if (rf) {
				const fullPath = join(rf.path, s.path);
				seriesPathMap.set(fullPath, s);
			}
		}
	}

	// Get all unmatched TV files
	const unmatchedTvFiles = await db
		.select()
		.from(unmatchedFiles)
		.where(eq(unmatchedFiles.mediaType, 'tv'));

	let filesLinked = 0;
	for (const unmatched of unmatchedTvFiles) {
		// Check if this file is inside a known series folder
		for (const [seriesPath, seriesData] of seriesPathMap) {
			if (unmatched.path.startsWith(seriesPath + '/')) {
				// This file is inside this series folder!
				const relativePath = relative(seriesPath, unmatched.path);
				const filename = basename(unmatched.path);

				// Parse season/episode
				const parsed = parseSeasonEpisode(filename);
				if (!parsed) {
					console.log(`   ⚠️  Could not parse S/E from: ${filename}`);
					continue;
				}

				// Check if episode_file already exists for this path
				const existing = await db
					.select()
					.from(episodeFiles)
					.where(
						and(
							eq(episodeFiles.seriesId, seriesData.id),
							eq(episodeFiles.relativePath, relativePath)
						)
					)
					.limit(1);

				if (existing.length > 0) {
					console.log(`   ⏭️  Already exists: ${relativePath}`);
					// Remove from unmatched since it's already linked
					await db.delete(unmatchedFiles).where(eq(unmatchedFiles.id, unmatched.id));
					continue;
				}

				// Find matching episode
				const matchingEpisode = await db
					.select()
					.from(episodes)
					.where(
						and(
							eq(episodes.seriesId, seriesData.id),
							eq(episodes.seasonNumber, parsed.season),
							eq(episodes.episodeNumber, parsed.episode)
						)
					)
					.limit(1);

				const episodeIds = matchingEpisode.length > 0 ? [matchingEpisode[0].id] : [];

				// Create episode_file record
				await db.insert(episodeFiles).values({
					seriesId: seriesData.id,
					seasonNumber: parsed.season,
					episodeIds,
					relativePath,
					size: unmatched.size,
					dateAdded: new Date().toISOString()
				});

				// Remove from unmatched
				await db.delete(unmatchedFiles).where(eq(unmatchedFiles.id, unmatched.id));

				console.log(
					`   ✅ Linked: ${relativePath} → S${String(parsed.season).padStart(2, '0')}E${String(parsed.episode).padStart(2, '0')}`
				);
				filesLinked++;
				break; // Found the series, no need to check others
			}
		}
	}
	console.log(`   ✅ Linked ${filesLinked} unmatched files to series\n`);
	totalFixed += filesLinked;

	// =====================================================
	// Step 3: Reset hasFile flags based on actual episode_files
	// =====================================================
	console.log('🔄 Step 3: Resetting hasFile flags...');

	// First, set all hasFile to false
	await db.update(episodes).set({ hasFile: false });

	// Get all episode_files with their episodeIds
	const allEpisodeFiles = await db
		.select({
			episodeIds: episodeFiles.episodeIds
		})
		.from(episodeFiles);

	// Collect all episode IDs that have files
	const episodeIdsWithFiles = new Set<string>();
	for (const ef of allEpisodeFiles) {
		if (ef.episodeIds) {
			for (const id of ef.episodeIds) {
				episodeIdsWithFiles.add(id);
			}
		}
	}

	// Update episodes that have files
	let hasFileUpdated = 0;
	if (episodeIdsWithFiles.size > 0) {
		const idsArray = Array.from(episodeIdsWithFiles);
		// Update in batches to avoid too many parameters
		const batchSize = 100;
		for (let i = 0; i < idsArray.length; i += batchSize) {
			const batch = idsArray.slice(i, i + batchSize);
			await db.update(episodes).set({ hasFile: true }).where(inArray(episodes.id, batch));
		}
		hasFileUpdated = idsArray.length;
	}
	console.log(`   ✅ Set hasFile=true for ${hasFileUpdated} episodes\n`);

	// =====================================================
	// Step 4: Recalculate series.episode_file_count
	// =====================================================
	console.log('📊 Step 4: Recalculating series episode counts...');

	const allSeriesForUpdate = await db.select({ id: series.id }).from(series);

	for (const s of allSeriesForUpdate) {
		const today = new Date().toISOString().split('T')[0];
		const isAired = (ep: typeof episodes.$inferSelect) =>
			Boolean(ep.airDate && ep.airDate !== '' && ep.airDate <= today);

		// Get all regular episodes for this series
		const allRegularEpisodes = await db
			.select()
			.from(episodes)
			.where(and(eq(episodes.seriesId, s.id), ne(episodes.seasonNumber, 0)));

		// Count only aired episodes with hasFile=true
		const airedEpisodes = allRegularEpisodes.filter(isAired);
		const episodesWithFiles = airedEpisodes.filter((ep) => ep.hasFile);

		await db
			.update(series)
			.set({
				episodeFileCount: episodesWithFiles.length,
				episodeCount: airedEpisodes.length
			})
			.where(eq(series.id, s.id));
	}
	console.log(`   ✅ Updated ${allSeriesForUpdate.length} series counts\n`);

	// =====================================================
	// Step 5: Recalculate seasons.episode_file_count
	// =====================================================
	console.log('📅 Step 5: Recalculating season episode counts...');

	const allSeasons = await db.select().from(seasons);

	for (const season of allSeasons) {
		const today = new Date().toISOString().split('T')[0];
		const isAired = (ep: typeof episodes.$inferSelect) =>
			Boolean(ep.airDate && ep.airDate !== '' && ep.airDate <= today);

		// Get all episodes for this season
		const allSeasonEpisodes = await db
			.select()
			.from(episodes)
			.where(
				and(eq(episodes.seriesId, season.seriesId), eq(episodes.seasonNumber, season.seasonNumber))
			);

		// Count only aired episodes with hasFile=true
		const airedEpisodes = allSeasonEpisodes.filter(isAired);
		const episodesWithFiles = airedEpisodes.filter((ep) => ep.hasFile);

		await db
			.update(seasons)
			.set({
				episodeFileCount: episodesWithFiles.length,
				episodeCount: airedEpisodes.length
			})
			.where(eq(seasons.id, season.id));
	}
	console.log(`   ✅ Updated ${allSeasons.length} season counts\n`);

	// =====================================================
	// Step 6: Recalculate movies.hasFile
	// =====================================================
	console.log('🎬 Step 6: Recalculating movie hasFile flags...');

	// First, set all hasFile to false
	await db.update(movies).set({ hasFile: false });

	// Get all movie IDs that have files
	const movieIdsWithFiles = await db
		.select({ movieId: movieFiles.movieId })
		.from(movieFiles)
		.groupBy(movieFiles.movieId);

	// Update movies that have files
	let movieHasFileUpdated = 0;
	if (movieIdsWithFiles.length > 0) {
		const idsArray = movieIdsWithFiles.map((m) => m.movieId);
		const batchSize = 100;
		for (let i = 0; i < idsArray.length; i += batchSize) {
			const batch = idsArray.slice(i, i + batchSize);
			await db.update(movies).set({ hasFile: true }).where(inArray(movies.id, batch));
		}
		movieHasFileUpdated = idsArray.length;
	}
	console.log(`   ✅ Set hasFile=true for ${movieHasFileUpdated} movies\n`);

	// =====================================================
	// Step 7: Remove duplicate queue entries (same download)
	// =====================================================
	console.log('📥 Step 7: Removing duplicate queue entries...');

	const allQueueItems = await db.select().from(downloadQueue);
	const queueGroups = new Map<string, typeof allQueueItems>();

	for (const item of allQueueItems) {
		const key = `${item.downloadClientId}::${item.downloadId}`;
		const existing = queueGroups.get(key) || [];
		existing.push(item);
		queueGroups.set(key, existing);
	}

	let queueDuplicatesRemoved = 0;
	for (const [, items] of queueGroups) {
		if (items.length > 1) {
			// Sort by addedAt descending (newest first), keep the first
			items.sort((a, b) => {
				const dateA = a.addedAt ? new Date(a.addedAt).getTime() : 0;
				const dateB = b.addedAt ? new Date(b.addedAt).getTime() : 0;
				return dateB - dateA;
			});

			// Delete all but the newest
			const toDelete = items.slice(1);
			for (const item of toDelete) {
				await db.delete(downloadQueue).where(eq(downloadQueue.id, item.id));
				queueDuplicatesRemoved++;
			}

			if (items.length > 2) {
				console.log(`   ⚠️  Queue had ${items.length} duplicates: ${items[0].title}`);
			}
		}
	}
	console.log(`   ✅ Removed ${queueDuplicatesRemoved} duplicate queue entries\n`);
	totalFixed += queueDuplicatesRemoved;

	// =====================================================
	// Step 8: Clean up completed/removed download_queue
	// =====================================================
	console.log('🗑️  Step 8: Cleaning up completed queue entries...');

	const deletedQueue = await db
		.delete(downloadQueue)
		.where(inArray(downloadQueue.status, ['imported', 'removed']))
		.returning({ id: downloadQueue.id });

	console.log(`   ✅ Removed ${deletedQueue.length} completed queue entries\n`);
	totalFixed += deletedQueue.length;

	// =====================================================
	// Step 9: Fetch missing external IDs from TMDB
	// =====================================================
	console.log('🔗 Step 9: Fetching missing external IDs from TMDB...');

	// Import TMDB client
	const { tmdb } = await import('../src/lib/server/tmdb.js');
	const { isNull, or } = await import('drizzle-orm');

	// Helper for rate limiting
	const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	// Find movies with missing IMDB ID
	const moviesWithMissingIds = await db
		.select({
			id: movies.id,
			tmdbId: movies.tmdbId,
			title: movies.title
		})
		.from(movies)
		.where(isNull(movies.imdbId));

	console.log(`   Found ${moviesWithMissingIds.length} movies with missing IMDB ID`);

	let moviesUpdated = 0;
	let movieErrors = 0;

	for (const movie of moviesWithMissingIds) {
		try {
			const externalIds = await tmdb.getMovieExternalIds(movie.tmdbId);

			if (externalIds.imdb_id) {
				await db.update(movies).set({ imdbId: externalIds.imdb_id }).where(eq(movies.id, movie.id));

				moviesUpdated++;
				console.log(`   ✅ Updated movie: ${movie.title} → ${externalIds.imdb_id}`);
			}
		} catch {
			movieErrors++;
			console.log(`   ⚠️  Failed to fetch for movie: ${movie.title}`);
		}

		// Rate limit: 250ms between calls (TMDB allows 40 req/10s)
		await delay(250);
	}

	// Find series with missing IMDB or TVDB IDs
	const seriesWithMissingIds = await db
		.select({
			id: series.id,
			tmdbId: series.tmdbId,
			imdbId: series.imdbId,
			tvdbId: series.tvdbId,
			title: series.title
		})
		.from(series)
		.where(or(isNull(series.imdbId), isNull(series.tvdbId)));

	console.log(`   Found ${seriesWithMissingIds.length} series with missing external IDs`);

	let seriesUpdated = 0;
	let seriesErrors = 0;

	for (const show of seriesWithMissingIds) {
		try {
			const externalIds = await tmdb.getTvExternalIds(show.tmdbId);

			const updateData: { imdbId?: string; tvdbId?: number } = {};

			if (!show.imdbId && externalIds.imdb_id) {
				updateData.imdbId = externalIds.imdb_id;
			}
			if (!show.tvdbId && externalIds.tvdb_id) {
				updateData.tvdbId = externalIds.tvdb_id;
			}

			if (Object.keys(updateData).length > 0) {
				await db.update(series).set(updateData).where(eq(series.id, show.id));

				seriesUpdated++;
				console.log(
					`   ✅ Updated series: ${show.title} → IMDB: ${updateData.imdbId || 'N/A'}, TVDB: ${updateData.tvdbId || 'N/A'}`
				);
			}
		} catch {
			seriesErrors++;
			console.log(`   ⚠️  Failed to fetch for series: ${show.title}`);
		}

		// Rate limit: 250ms between calls
		await delay(250);
	}

	console.log(`   ✅ Updated ${moviesUpdated} movies, ${seriesUpdated} series`);
	if (movieErrors > 0 || seriesErrors > 0) {
		console.log(`   ⚠️  Errors: ${movieErrors} movies, ${seriesErrors} series\n`);
	} else {
		console.log('');
	}
	totalFixed += moviesUpdated + seriesUpdated;

	// =====================================================
	// Summary
	// =====================================================
	console.log('═══════════════════════════════════════════════════');
	console.log('✅ Library repair complete!');
	console.log(`   Total items fixed: ${totalFixed}`);
	console.log('   - Duplicate episode_files removed: ' + duplicatesRemoved);
	console.log('   - Duplicate movie_files removed: ' + movieDuplicatesRemoved);
	console.log('   - Unmatched files linked: ' + filesLinked);
	console.log('   - Duplicate queue entries removed: ' + queueDuplicatesRemoved);
	console.log('   - Completed queue entries cleaned: ' + deletedQueue.length);
	console.log('   - Movies with external IDs updated: ' + moviesUpdated);
	console.log('   - Series with external IDs updated: ' + seriesUpdated);
	console.log('═══════════════════════════════════════════════════\n');

	console.log('📌 Next steps:');
	console.log('   1. Run a library scan to pick up any remaining unmatched files');
	console.log('   2. Check the UI to verify episode and movie counts are correct');
}

main().catch((error) => {
	console.error('❌ Repair failed:', error);
	process.exit(1);
});
