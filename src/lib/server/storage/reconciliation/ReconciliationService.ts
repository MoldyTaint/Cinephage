import { EventEmitter } from 'node:events';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { ServiceStatus, BackgroundService } from '$lib/server/services/background-service.js';
import { db } from '$lib/server/db';
import {
	episodeFiles,
	episodes,
	mediaServerSyncedItems,
	movies,
	movieFiles,
	series,
	storageItemServerLinks,
	storageItems
} from '$lib/server/db/schema';
import { createChildLogger } from '$lib/logging';
import { logicalKey } from './matchers.js';
import type { ReconcileResult } from '../types.js';

const logger = createChildLogger({ logDomain: 'system' as const });

/**
 * Internal shape used during reconciliation to represent a local source row.
 */
type SourceRow = {
	itemType: 'movie' | 'episode';
	tmdbId: number | null;
	title: string;
	year: number | null;
	seasonNumber: number | null;
	episodeNumber: number | null;
	movieFileId: string | null;
	episodeFileId: string | null;
	rootFolderId: string | null;
	libraryId: string | null;
};

class ReconciliationService extends EventEmitter implements BackgroundService {
	readonly name = 'ReconciliationService';
	private _status: ServiceStatus = 'pending';
	private _error?: Error;
	private reconcileLock = false;
	private listenersAttached = false;
	private attachPromise: Promise<void> | null = null;

	get status(): ServiceStatus {
		return this._status;
	}

	get error(): Error | undefined {
		return this._error;
	}

	start(): void {
		if (this._status !== 'pending') return;
		this._status = 'starting';
		setImmediate(() => {
			try {
				this.attachListeners();
				this._status = 'ready';
				logger.info('[ReconciliationService] ready; will run on scan/sync events');
				// Trigger an initial reconcile (backfill) shortly after startup,
				// delayed so we don't compete with other services' startup work.
				setTimeout(() => {
					this.reconcile().catch((err) => {
						logger.error('[ReconciliationService] initial reconcile failed', err);
					});
				}, 5000);
			} catch (e) {
				this._error = e instanceof Error ? e : new Error(String(e));
				this._status = 'error';
				logger.error('[ReconciliationService] startup failed', this._error);
			}
		});
	}

	async stop(): Promise<void> {
		if (this.attachPromise) {
			await this.attachPromise;
			this.attachPromise = null;
		}
		this.detachListeners();
		this._status = 'pending';
	}

	private attachListeners(): void {
		if (this.listenersAttached) return;
		this.listenersAttached = true;
		// Lazy-import to avoid circular deps at module load time.
		// Track the combined Promise so stop() can await completion before detaching,
		// preventing orphaned listeners if stop() is called while imports are in-flight.
		this.attachPromise = Promise.all([
			import('$lib/server/library/library-scheduler.js')
				.then(({ getLibraryScheduler }) => {
					getLibraryScheduler().on('scanComplete', this.handleTrigger);
				})
				.catch((e) => {
					logger.error('[ReconciliationService] failed to subscribe to scanComplete', e);
				}),
			import('$lib/server/mediaServerStats/MediaServerStatsSyncService.js')
				.then(({ getMediaServerStatsSyncService }) => {
					getMediaServerStatsSyncService().on('syncComplete', this.handleTrigger);
				})
				.catch((e) => {
					logger.error('[ReconciliationService] failed to subscribe to syncComplete', e);
				}),
			// Subscribe to library data mutations (movie/series/episode/season CRUD,
			// root-folder and library changes). The reconcileLock coalesces concurrent
			// triggers, so a 50-item batch delete produces one reconcile run, not 50.
			import('$lib/server/library/LibraryMediaEvents.js')
				.then(({ libraryMediaEvents }) => {
					libraryMediaEvents.onLibraryDataChanged(this.handleTrigger);
				})
				.catch((e) => {
					logger.error('[ReconciliationService] failed to subscribe to library:data-changed', e);
				})
		]).then(() => undefined);
	}

	private detachListeners(): void {
		if (!this.listenersAttached) return;
		this.listenersAttached = false;
		void import('$lib/server/library/library-scheduler.js')
			.then(({ getLibraryScheduler }) => {
				getLibraryScheduler().off('scanComplete', this.handleTrigger);
			})
			.catch((e) => {
				logger.error('[ReconciliationService] failed to unsubscribe from scanComplete', e);
			});
		void import('$lib/server/mediaServerStats/MediaServerStatsSyncService.js')
			.then(({ getMediaServerStatsSyncService }) => {
				getMediaServerStatsSyncService().off('syncComplete', this.handleTrigger);
			})
			.catch((e) => {
				logger.error('[ReconciliationService] failed to unsubscribe from syncComplete', e);
			});
		void import('$lib/server/library/LibraryMediaEvents.js')
			.then(({ libraryMediaEvents }) => {
				libraryMediaEvents.offLibraryDataChanged(this.handleTrigger);
			})
			.catch((e) => {
				logger.error('[ReconciliationService] failed to unsubscribe from library:data-changed', e);
			});
	}

	private handleTrigger = (): void => {
		this.reconcile().catch((err) => {
			logger.error('[ReconciliationService] reconcile failed after trigger', err);
		});
	};

	/**
	 * Run a full reconciliation pass. Idempotent; safe to call repeatedly.
	 * Acquires a lock so concurrent triggers coalesce into one run.
	 */
	async reconcile(): Promise<ReconcileResult> {
		const start = Date.now();
		if (this.reconcileLock) {
			logger.debug('[ReconciliationService] reconcile already in progress; skipping');
			return {
				itemsUpserted: 0,
				itemsInserted: 0,
				itemsUpdated: 0,
				itemsDeleted: 0,
				linksUpserted: 0,
				errorCount: 0,
				durationMs: 0,
				skipped: true
			};
		}
		this.reconcileLock = true;
		try {
			const [localRows, serverItemRows, existingItems, existingLinks] = await Promise.all([
				this.loadLocalRows(),
				this.loadServerItems(),
				db.select().from(storageItems),
				db.select().from(storageItemServerLinks)
			]);

			// All writes run inside a single transaction so a 10k-item library
			// commits once instead of issuing 20k+ autocommit round-trips, and a
			// crash mid-reconcile cannot leave partial state. Note: better-sqlite3
			// transactions are synchronous, so the callback must not be async —
			// we use the sync query methods (.run()/.all()) on `tx`.
			//
			// SCALING NOTE: The entire transaction runs synchronously and blocks
			// the Node event loop for its duration. For typical libraries (<1k items)
			// this is <100ms — unnoticeable. For large libraries (10k+ items) the
			// blocking window grows to ~500ms-2s, which delays request handling.
			// If this becomes a problem: refactor to chunked transactions (batches
			// of ~500 items, each in its own short transaction, yield via setImmediate
			// between batches). See docs/superpowers/plans/2026-07-01-storage-overhaul-phase-2-reconciliation.md.
			const result = db.transaction((tx) => {
				// Desired state from local sources: Map<logicalKey, SourceRow>
				const desired = new Map<string, SourceRow>();
				for (const row of localRows) {
					if (row.tmdbId === null) continue;
					const key = logicalKey(row.itemType, row.tmdbId, row.seasonNumber, row.episodeNumber);
					if (!desired.has(key)) desired.set(key, row); // first row wins (matches existing dedup)
				}

				// Server items: Map<logicalKey, serverItem[]>
				const serverByKey = new Map<string, Array<typeof mediaServerSyncedItems.$inferSelect>>();
				for (const s of serverItemRows) {
					const key = logicalKey(
						s.itemType as 'movie' | 'episode',
						s.tmdbId,
						s.seasonNumber,
						s.episodeNumber
					);
					if (!serverByKey.has(key)) serverByKey.set(key, []);
					serverByKey.get(key)!.push(s);
				}

				// File-granularity server coverage: media servers report one item
				// per physical file, so a combined file (e.g. S02E12-E13) appears
				// under a single episode number. Without this, every episode after
				// the first in the range would have no 1:1 server counterpart and
				// be flagged as "missing from your media server". A server episode
				// item (series tmdbId + season + episode number) covers a local file
				// whose episodeIds include that number.
				const filesByTmdbSeason = new Map<
					string,
					Array<{ fileId: string; episodeNumbers: Set<number> }>
				>();
				for (const row of localRows) {
					if (
						row.itemType !== 'episode' ||
						!row.episodeFileId ||
						row.tmdbId === null ||
						row.seasonNumber === null ||
						row.episodeNumber === null
					) {
						continue;
					}
					const seasonKey = `${row.tmdbId}:${row.seasonNumber}`;
					let files = filesByTmdbSeason.get(seasonKey);
					if (!files) {
						files = [];
						filesByTmdbSeason.set(seasonKey, files);
					}
					let fileEntry = files.find((f) => f.fileId === row.episodeFileId);
					if (!fileEntry) {
						fileEntry = { fileId: row.episodeFileId, episodeNumbers: new Set() };
						files.push(fileEntry);
					}
					fileEntry.episodeNumbers.add(row.episodeNumber);
				}
				const serverItemsByFile = new Map<
					string,
					Array<typeof mediaServerSyncedItems.$inferSelect>
				>();
				for (const s of serverItemRows) {
					if (
						s.itemType !== 'episode' ||
						s.tmdbId === null ||
						s.seasonNumber === null ||
						s.episodeNumber === null
					) {
						continue;
					}
					const files = filesByTmdbSeason.get(`${s.tmdbId}:${s.seasonNumber}`);
					if (!files) {
						continue;
					}
					for (const file of files) {
						if (!file.episodeNumbers.has(s.episodeNumber)) {
							continue;
						}
						const arr = serverItemsByFile.get(file.fileId);
						if (arr) {
							arr.push(s);
						} else {
							serverItemsByFile.set(file.fileId, [s]);
						}
					}
				}

				// Existing rows indexed by logical key
				const existingByKey = new Map<string, typeof storageItems.$inferSelect>();
				for (const item of existingItems) {
					const key = logicalKey(
						item.itemType as 'movie' | 'episode',
						item.tmdbId,
						item.seasonNumber,
						item.episodeNumber
					);
					existingByKey.set(key, item);
				}
				const existingLinkIds = new Set(
					existingLinks.map((l) => `${l.storageItemId}:${l.serverId}`)
				);

				const keepItemIds = new Set<string>();
				let itemsInserted = 0;
				let itemsUpdated = 0;
				let linksUpserted = 0;
				let errorCount = 0;
				const now = new Date().toISOString();

				const allKeys = new Set<string>([...desired.keys(), ...serverByKey.keys()]);

				for (const key of allKeys) {
					try {
						const localRow = desired.get(key) ?? null;
						let serverItems = serverByKey.get(key) ?? [];
						// Fall back to file-granularity coverage for episodes of a
						// multi-episode file: the file exists on the server under a
						// sibling episode number, so this episode is satisfied too.
						if (serverItems.length === 0 && localRow?.episodeFileId) {
							serverItems = serverItemsByFile.get(localRow.episodeFileId) ?? [];
						}
						const existing = existingByKey.get(key);

						// Preserve any pre-existing row even if this iteration later
						// throws, so a transient update failure doesn't cause a
						// stale-cleanup deletion.
						if (existing) keepItemIds.add(existing.id);

						const hasLocal = localRow !== null;
						const hasServer = serverItems.length > 0;
						const sourceSystem = hasLocal && hasServer ? 'both' : hasLocal ? 'local' : 'server';
						const matchConfidence = hasLocal ? 'exact' : 'id';

						const title = localRow?.title ?? serverItems[0]?.title ?? 'Unknown';
						const year = localRow?.year ?? serverItems[0]?.year ?? null;
						const seriesName = serverItems[0]?.seriesName ?? null;
						const itemType = (localRow?.itemType ?? serverItems[0]?.itemType ?? 'movie') as
							'movie' | 'episode' | 'series' | 'season';
						const tmdbId = localRow?.tmdbId ?? serverItems[0]?.tmdbId ?? null;
						const tvdbId = serverItems[0]?.tvdbId ?? null;
						const imdbId = serverItems[0]?.imdbId ?? null;
						// Movies must never carry season/episode values: the unique index and
						// logicalKey match movies on tmdbId alone, and stray server-side
						// metadata (e.g. Jellyfin reporting IndexNumber=1 on a movie) would
						// otherwise create a second storage_items row for the same film.
						const isMovie = itemType === 'movie';
						const seasonNumber = isMovie
							? null
							: (localRow?.seasonNumber ?? serverItems[0]?.seasonNumber ?? null);
						const episodeNumber = isMovie
							? null
							: (localRow?.episodeNumber ?? serverItems[0]?.episodeNumber ?? null);

						let itemId: string;
						if (existing) {
							itemId = existing.id;
							tx.update(storageItems)
								.set({
									title,
									year,
									seriesName,
									itemType,
									tmdbId,
									tvdbId,
									imdbId,
									seasonNumber,
									episodeNumber,
									movieFileId: localRow?.movieFileId ?? null,
									episodeFileId: localRow?.episodeFileId ?? null,
									rootFolderId: localRow?.rootFolderId ?? null,
									libraryId: localRow?.libraryId ?? null,
									sourceSystem,
									matchConfidence,
									lastReconciledAt: now
								})
								.where(eq(storageItems.id, existing.id))
								.run();
							itemsUpdated++;
						} else {
							const [inserted] = tx
								.insert(storageItems)
								.values({
									itemType,
									tmdbId,
									tvdbId,
									imdbId,
									title,
									year,
									seriesName,
									seasonNumber,
									episodeNumber,
									movieFileId: localRow?.movieFileId ?? null,
									episodeFileId: localRow?.episodeFileId ?? null,
									rootFolderId: localRow?.rootFolderId ?? null,
									libraryId: localRow?.libraryId ?? null,
									sourceSystem,
									matchConfidence,
									firstSeenAt: now,
									lastReconciledAt: now
								})
								.returning({ id: storageItems.id })
								.all();
							itemId = inserted.id;
							itemsInserted++;
						}
						keepItemIds.add(itemId);

						// Upsert server links
						for (const s of serverItems) {
							const linkKey = `${itemId}:${s.serverId}`;
							if (!existingLinkIds.has(linkKey)) {
								tx.insert(storageItemServerLinks)
									.values({
										storageItemId: itemId,
										serverId: s.serverId,
										syncedItemId: s.id,
										lastSeenAt: now
									})
									.onConflictDoNothing()
									.run();
							} else {
								tx.update(storageItemServerLinks)
									.set({ lastSeenAt: now, syncedItemId: s.id })
									.where(
										and(
											eq(storageItemServerLinks.storageItemId, itemId),
											eq(storageItemServerLinks.serverId, s.serverId)
										)
									)
									.run();
							}
							linksUpserted++;
						}
					} catch (itemError) {
						// Isolate per-item failures so one bad row can't abort the
						// whole run (and re-abort on every subsequent run).
						errorCount++;
						logger.warn(`[ReconciliationService] failed to reconcile key ${key}`, {
							error: itemError instanceof Error ? itemError : new Error(String(itemError))
						});
						continue;
					}
				}

				// Stale cleanup: remove rows no longer present in any source
				let itemsDeleted = 0;
				const staleIds = existingItems.filter((i) => !keepItemIds.has(i.id)).map((i) => i.id);
				if (staleIds.length > 0) {
					tx.delete(storageItems).where(inArray(storageItems.id, staleIds)).run();
					itemsDeleted = staleIds.length;
				}

				return {
					itemsUpserted: itemsInserted + itemsUpdated,
					itemsInserted,
					itemsUpdated,
					itemsDeleted,
					linksUpserted,
					errorCount,
					durationMs: Date.now() - start,
					skipped: false as const
				};
			});

			logger.info(
				`[ReconciliationService] reconcile complete: ${result.itemsInserted} new, ${result.itemsUpdated} updated, ${result.itemsDeleted} removed, ${result.linksUpserted} links, ${result.errorCount} errors in ${result.durationMs}ms`
			);
			this.emit('reconcileComplete', result);
			return result;
		} catch (e) {
			this._error = e instanceof Error ? e : new Error(String(e));
			logger.error('[ReconciliationService] reconcile threw', this._error);
			throw e;
		} finally {
			this.reconcileLock = false;
		}
	}

	private async loadLocalRows(): Promise<SourceRow[]> {
		const [movieFileRows, episodeFileRows, episodeRows] = await Promise.all([
			db
				.select({
					movieId: movies.id,
					movieFileId: movieFiles.id,
					tmdbId: movies.tmdbId,
					title: movies.title,
					year: movies.year,
					libraryId: movies.libraryId,
					rootFolderId: movies.rootFolderId
				})
				.from(movies)
				.leftJoin(movieFiles, eq(movieFiles.movieId, movies.id)),
			db
				.select({
					seriesId: series.id,
					episodeFileId: episodeFiles.id,
					tmdbId: series.tmdbId,
					title: series.title,
					year: series.year,
					libraryId: series.libraryId,
					rootFolderId: series.rootFolderId,
					seasonNumber: episodeFiles.seasonNumber,
					episodeIds: episodeFiles.episodeIds
				})
				.from(series)
				.innerJoin(episodeFiles, eq(episodeFiles.seriesId, series.id)),
			db
				.select({
					id: episodes.id,
					episodeNumber: episodes.episodeNumber,
					seasonNumber: episodes.seasonNumber,
					seriesId: episodes.seriesId
				})
				.from(episodes)
		]);

		// Map<episodeId, { episodeNumber, seasonNumber }> for per-episode expansion.
		// An episode file can cover multiple episodes (e.g. double episodes); we emit
		// one SourceRow per covered episode so each gets its own storage_items row
		// instead of collapsing to a single row via the COALESCE(-1) unique index.
		const episodeById = new Map<string, { episodeNumber: number; seasonNumber: number }>();
		for (const e of episodeRows) {
			episodeById.set(e.id, { episodeNumber: e.episodeNumber, seasonNumber: e.seasonNumber });
		}

		const movieRows: SourceRow[] = movieFileRows
			.filter((r) => r.tmdbId !== null && r.movieFileId !== null)
			.map((r) => ({
				itemType: 'movie' as const,
				tmdbId: r.tmdbId,
				title: r.title,
				year: r.year ?? null,
				seasonNumber: null,
				episodeNumber: null,
				movieFileId: r.movieFileId,
				episodeFileId: null,
				rootFolderId: r.rootFolderId ?? null,
				libraryId: r.libraryId ?? null
			}));

		const epRows: SourceRow[] = [];
		for (const r of episodeFileRows) {
			if (r.tmdbId === null) continue;
			const ids = r.episodeIds ?? [];
			const resolved = ids
				.map((id) => episodeById.get(id))
				.filter((e): e is { episodeNumber: number; seasonNumber: number } => e !== undefined);

			if (resolved.length > 0) {
				for (const ep of resolved) {
					epRows.push({
						itemType: 'episode' as const,
						tmdbId: r.tmdbId,
						title: r.title,
						year: r.year ?? null,
						seasonNumber: ep.seasonNumber,
						episodeNumber: ep.episodeNumber,
						movieFileId: null,
						episodeFileId: r.episodeFileId,
						rootFolderId: r.rootFolderId ?? null,
						libraryId: r.libraryId ?? null
					});
				}
			} else {
				// No episode linkage resolved (empty/null episodeIds, or IDs missing
				// from the episodes table): fall back to file-granularity, preserving
				// backwards compatibility.
				if (ids.length > 0) {
					// episodeIds reference UUIDs that no longer exist in the episodes
					// table (e.g. after a re-scan regenerated episode IDs). This is a
					// data-integrity problem worth surfacing: the file collapses onto a
					// null-episode row and won't match numbered server episodes.
					logger.warn(
						`[ReconciliationService] episode file ${r.episodeFileId} for "${r.title}" S${r.seasonNumber} has ${ids.length} episode_ids but none resolve to the episodes table; falling back to file-granularity`,
						{ episodeFileId: r.episodeFileId, seriesId: r.seriesId, unresolvedIds: ids }
					);
				}
				epRows.push({
					itemType: 'episode' as const,
					tmdbId: r.tmdbId,
					title: r.title,
					year: r.year ?? null,
					seasonNumber: r.seasonNumber,
					episodeNumber: null,
					movieFileId: null,
					episodeFileId: r.episodeFileId,
					rootFolderId: r.rootFolderId ?? null,
					libraryId: r.libraryId ?? null
				});
			}
		}

		return [...movieRows, ...epRows];
	}

	private async loadServerItems(): Promise<Array<typeof mediaServerSyncedItems.$inferSelect>> {
		return db
			.select()
			.from(mediaServerSyncedItems)
			.where(sql`${mediaServerSyncedItems.tmdbId} IS NOT NULL`);
	}
}

let instance: ReconciliationService | null = null;

export function getReconciliationService(): ReconciliationService {
	if (!instance) instance = new ReconciliationService();
	return instance;
}

/** Test-only: reset the singleton between tests. */
export function __resetReconciliationServiceForTests(): void {
	instance = null;
}
