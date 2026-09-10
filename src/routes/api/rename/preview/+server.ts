/**
 * Bulk Rename Preview API
 *
 * GET /api/rename/preview?mediaType=movie|tv|all
 *
 * Always returns an NDJSON stream (application/x-ndjson) so the client can
 * show counts and items progressively. Three paths:
 *
 *   1. Cache fresh: emits cached items in 500-item batches then "done"
 *   2. Partially stale: recomputes only the stale mediaIds, patches the cache,
 *  	then serves the merged result
 *   3. Cold / fully stale: streams counts first ("start"), then item batches
 * 		progressively as the full compute runs
 */

import type { RequestHandler } from './$types';
import {
	RenamePreviewService,
	type RenameStreamEvent
} from '$lib/server/library/naming/RenamePreviewService';
import type { RenamePreviewResult } from '$lib/library/naming/types.js';
import { renamePreviewCache } from '$lib/server/library/naming/RenamePreviewCache.js';
import { db } from '$lib/server/db';
import { movieFiles, episodeFiles } from '$lib/server/db/schema';
import { count } from 'drizzle-orm';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ module: 'RenamePreviewApi', logDomain: 'scans' });

const STREAM_BATCH_SIZE = 500;

function ndjsonLine(obj: unknown): Uint8Array {
	return new TextEncoder().encode(JSON.stringify(obj) + '\n');
}

function* iterateBatches<T>(arr: T[], size: number): Generator<T[]> {
	for (let i = 0; i < arr.length; i += size) {
		yield arr.slice(i, i + size);
	}
}

/**
 * Stream a fully-computed result (cache-warm path).
 * All data is already in memory; batching prevents one huge JSON parse on the client.
 */
async function streamFromCache(
	result: RenamePreviewResult,
	controller: ReadableStreamDefaultController
): Promise<void> {
	controller.enqueue(
		ndjsonLine({
			type: 'start',
			totalFiles: result.totalFiles,
			computing: false
		} satisfies RenameStreamEvent)
	);

	for (const batch of iterateBatches(result.willChange, STREAM_BATCH_SIZE)) {
		controller.enqueue(
			ndjsonLine({ type: 'items', category: 'willChange', data: batch } satisfies RenameStreamEvent)
		);
	}
	for (const batch of iterateBatches(result.alreadyCorrect, STREAM_BATCH_SIZE)) {
		controller.enqueue(
			ndjsonLine({
				type: 'items',
				category: 'alreadyCorrect',
				data: batch
			} satisfies RenameStreamEvent)
		);
	}
	for (const batch of iterateBatches(result.collisions, STREAM_BATCH_SIZE)) {
		controller.enqueue(
			ndjsonLine({ type: 'items', category: 'collisions', data: batch } satisfies RenameStreamEvent)
		);
	}
	for (const batch of iterateBatches(result.errors, STREAM_BATCH_SIZE)) {
		controller.enqueue(
			ndjsonLine({ type: 'items', category: 'errors', data: batch } satisfies RenameStreamEvent)
		);
	}

	controller.enqueue(
		ndjsonLine({
			type: 'done',
			totalFiles: result.totalFiles,
			totalWillChange: result.totalWillChange,
			totalAlreadyCorrect: result.totalAlreadyCorrect,
			totalCollisions: result.totalCollisions,
			totalErrors: result.totalErrors
		} satisfies RenameStreamEvent)
	);
}

/**
 * Stream a cold-cache full compute.
 * Emits a "start" with a DB-count estimate first so the UI can show progress,
 * then streams item batches as they are computed.
 */
async function streamFullCompute(
	mediaType: 'movie' | 'tv' | 'all',
	controller: ReadableStreamDefaultController
): Promise<{ movieResult?: RenamePreviewResult; tvResult?: RenamePreviewResult }> {
	// Fast DB count for progress estimate.
	const [movieFileCount, episodeFileCount] = await Promise.all([
		db
			.select({ c: count() })
			.from(movieFiles)
			.then((r) => r[0]?.c ?? 0),
		db
			.select({ c: count() })
			.from(episodeFiles)
			.then((r) => r[0]?.c ?? 0)
	]);

	const estimatedFiles =
		mediaType === 'movie'
			? movieFileCount
			: mediaType === 'tv'
				? episodeFileCount
				: movieFileCount + episodeFileCount;

	controller.enqueue(
		ndjsonLine({
			type: 'start',
			totalFiles: estimatedFiles,
			computing: true
		} satisfies RenameStreamEvent)
	);

	const service = new RenamePreviewService();
	const emit = (event: RenameStreamEvent) => controller.enqueue(ndjsonLine(event));

	let movieResult: RenamePreviewResult | undefined;
	let tvResult: RenamePreviewResult | undefined;

	if (mediaType === 'movie' || mediaType === 'all') {
		movieResult = await service.previewAllMovies(emit);
		renamePreviewCache.set('movie', movieResult);
	}
	if (mediaType === 'tv' || mediaType === 'all') {
		tvResult = await service.previewAllEpisodes(emit);
		renamePreviewCache.set('tv', tvResult);
	}

	// Compute combined totals for the "done" event.
	const totalFiles = (movieResult?.totalFiles ?? 0) + (tvResult?.totalFiles ?? 0);
	const totalWillChange = (movieResult?.totalWillChange ?? 0) + (tvResult?.totalWillChange ?? 0);
	const totalAlreadyCorrect =
		(movieResult?.totalAlreadyCorrect ?? 0) + (tvResult?.totalAlreadyCorrect ?? 0);
	const totalCollisions = (movieResult?.totalCollisions ?? 0) + (tvResult?.totalCollisions ?? 0);
	const totalErrors = (movieResult?.totalErrors ?? 0) + (tvResult?.totalErrors ?? 0);

	controller.enqueue(
		ndjsonLine({
			type: 'done',
			totalFiles,
			totalWillChange,
			totalAlreadyCorrect,
			totalCollisions,
			totalErrors
		} satisfies RenameStreamEvent)
	);

	return { movieResult, tvResult };
}

export const GET: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { url } = event;
	const mediaType = (url.searchParams.get('mediaType') || 'all') as 'movie' | 'tv' | 'all';

	const needsMovie = mediaType === 'movie' || mediaType === 'all';
	const needsTv = mediaType === 'tv' || mediaType === 'all';

	const movieFresh = !needsMovie || renamePreviewCache.isFresh('movie');
	const tvFresh = !needsTv || renamePreviewCache.isFresh('tv');
	const moviePartial = needsMovie && renamePreviewCache.isPartiallyCached('movie');
	const tvPartial = needsTv && renamePreviewCache.isPartiallyCached('tv');

	const stream = new ReadableStream({
		async start(controller) {
			try {
				// Path 1: both caches fully fresh — emit from cache
				if (movieFresh && tvFresh) {
					const merged = buildMergedResult(mediaType);
					await streamFromCache(merged, controller);
					controller.close();
					return;
				}

				// Path 2: one or both partially stale — patch only the stale mediaIds,
				// then serve the merged cached result.
				if (moviePartial || tvPartial) {
					const service = new RenamePreviewService();

					if (moviePartial) {
						const staleIds = renamePreviewCache.getStaleIds('movie');
						const freshResult = await service.previewMoviesByIds([...staleIds]);
						renamePreviewCache.applyPatch('movie', staleIds, freshResult);
					}
					if (tvPartial) {
						const staleIds = renamePreviewCache.getStaleIds('tv');
						const freshResult = await service.previewSeriesByIds([...staleIds]);
						renamePreviewCache.applyPatch('tv', staleIds, freshResult);
					}

					// Both relevant caches are now fresh — stream from cache.
					const merged = buildMergedResult(mediaType);
					await streamFromCache(merged, controller);
					controller.close();
					return;
				}

				// Path 3: cold or fully stale — full streaming compute
				await streamFullCompute(mediaType, controller);
				controller.close();
			} catch (error) {
				logger.error(
					{ error: error instanceof Error ? error.message : String(error) },
					'[RenamePreview API] Failed to generate preview'
				);
				try {
					controller.enqueue(
						ndjsonLine({ type: 'error', message: 'Failed to generate rename preview' })
					);
				} catch {
					// controller may already be closed
				}
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'application/x-ndjson',
			'Cache-Control': 'no-cache',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};

function buildMergedResult(mediaType: 'movie' | 'tv' | 'all'): RenamePreviewResult {
	const movieResult = mediaType !== 'tv' ? renamePreviewCache.get('movie') : null;
	const tvResult = mediaType !== 'movie' ? renamePreviewCache.get('tv') : null;

	if (mediaType === 'movie' && movieResult) return movieResult;
	if (mediaType === 'tv' && tvResult) return tvResult;

	// Merge both
	const m = movieResult ?? emptyResult();
	const t = tvResult ?? emptyResult();
	return {
		willChange: [...m.willChange, ...t.willChange],
		alreadyCorrect: [...m.alreadyCorrect, ...t.alreadyCorrect],
		collisions: [...m.collisions, ...t.collisions],
		errors: [...m.errors, ...t.errors],
		totalFiles: m.totalFiles + t.totalFiles,
		totalWillChange: m.totalWillChange + t.totalWillChange,
		totalAlreadyCorrect: m.totalAlreadyCorrect + t.totalAlreadyCorrect,
		totalCollisions: m.totalCollisions + t.totalCollisions,
		totalErrors: m.totalErrors + t.totalErrors
	};
}

function emptyResult(): RenamePreviewResult {
	return {
		willChange: [],
		alreadyCorrect: [],
		collisions: [],
		errors: [],
		totalFiles: 0,
		totalWillChange: 0,
		totalAlreadyCorrect: 0,
		totalCollisions: 0,
		totalErrors: 0
	};
}
