/**
 * TVDB Episode Enrichment Service
 *
 * Background service that fills TV episode gaps (airDate, runtime, tvdbId,
 * title, overview) from TheTVDB for library series. TMDB remains canonical:
 * enrichment writes ONLY to NULL columns, so a subsequent TMDB refresh that
 * gains data always takes precedence.
 *
 * Modeled on ExternalIdService. Fails soft: a TVDB outage or a single bad
 * series never aborts the run.
 */

import type { BackgroundService, ServiceStatus } from './background-service.js';
import { db } from '$lib/server/db/index.js';
import { series, episodes, externalIdCache } from '$lib/server/db/schema.js';
import { and, eq, isNull, or } from 'drizzle-orm';
import { tmdb } from '$lib/server/tmdb.js';
import { tvdb, type TvdbEpisode } from '$lib/server/tvdb.js';
import { TVDB } from '$lib/config/constants';
import { logger } from '$lib/logging/index.js';

interface TvdbEnrichmentConfig {
	/** How often to run the scan in hours (default: 12) */
	intervalHours: number;
	/** Max series to process per run (default: 25) */
	batchSize: number;
	/** Delay between TVDB API calls in ms (default: 250) */
	apiDelayMs: number;
	/** Hard cap on per-episode /episodes/{id}/extended calls per run (default: 200) */
	maxEpisodeExtendedCallsPerRun: number;
	/** Whether to run immediately on startup (default: true) */
	runOnStartup: boolean;
}

const DEFAULT_CONFIG: TvdbEnrichmentConfig = {
	intervalHours: Number(process.env.TVDB_ENRICHMENT_INTERVAL_HOURS ?? 12),
	batchSize: Number(process.env.TVDB_ENRICHMENT_BATCH_SIZE ?? 25),
	apiDelayMs: Number(process.env.TVDB_ENRICHMENT_API_DELAY_MS ?? 250),
	maxEpisodeExtendedCallsPerRun: Number(process.env.TVDB_ENRICHMENT_MAX_EXTENDED_CALLS ?? 200),
	runOnStartup: process.env.TVDB_ENRICHMENT_RUN_ON_STARTUP !== 'false'
};

interface LibraryEpisode {
	id: string;
	seasonNumber: number;
	episodeNumber: number;
	title: string | null;
	overview: string | null;
	airDate: string | null;
	runtime: number | null;
	tvdbId: number | null;
}

export interface EpisodeGapUpdate {
	episodeId: string;
	airDate?: string;
	runtime?: number;
	tvdbId?: number;
	title?: string;
	overview?: string;
}

export interface EnrichRunSummary {
	seriesProcessed: number;
	seriesUpdated: number;
	episodesFilled: number;
	episodeExtendedCalls: number;
	errors: number;
	skipped: number;
	duration: number;
}

const NO_GAPS: EnrichRunSummary = {
	seriesProcessed: 0,
	seriesUpdated: 0,
	episodesFilled: 0,
	episodeExtendedCalls: 0,
	errors: 0,
	skipped: 0,
	duration: 0
};

// ---------------------------------------------------------------------------
// Pure planning helpers (unit-tested independently of the DB)
// ---------------------------------------------------------------------------

/** Build a TVDB episode lookup keyed by `${seasonNumber}-${episodeNumber}`. */
export function buildEpisodeMap(tvdbEpisodes: TvdbEpisode[]): Map<string, TvdbEpisode> {
	const map = new Map<string, TvdbEpisode>();
	for (const ep of tvdbEpisodes) {
		map.set(`${ep.seasonNumber}-${ep.number}`, ep);
	}
	return map;
}

/**
 * Pass 1 (cheap): plan NULL-only fills for airDate/runtime/tvdbId from the TVDB
 * list endpoint. Never overwrites a non-null library field.
 */
export function planPass1(
	libraryEpisodes: LibraryEpisode[],
	tvdbMap: Map<string, TvdbEpisode>
): EpisodeGapUpdate[] {
	const updates: EpisodeGapUpdate[] = [];
	for (const ep of libraryEpisodes) {
		const match = tvdbMap.get(`${ep.seasonNumber}-${ep.episodeNumber}`);
		if (!match) continue;

		const update: EpisodeGapUpdate = { episodeId: ep.id };
		if (ep.airDate == null && match.aired) update.airDate = match.aired;
		if (ep.runtime == null && match.runtime != null && match.runtime > 0)
			update.runtime = match.runtime;
		if (ep.tvdbId == null && match.id) update.tvdbId = match.id;

		if (Object.keys(update).length > 1) updates.push(update);
	}
	return updates;
}

/**
 * Pass 2 targets: library episodes still missing title/overview that have a
 * matching TVDB episode id to query via /episodes/{id}/extended.
 */
export function planPass2Targets(
	libraryEpisodes: LibraryEpisode[],
	tvdbMap: Map<string, TvdbEpisode>
): { episodeId: string; tvdbEpisodeId: number }[] {
	const targets: { episodeId: string; tvdbEpisodeId: number }[] = [];
	for (const ep of libraryEpisodes) {
		if (ep.title != null && ep.overview != null) continue;
		const match = tvdbMap.get(`${ep.seasonNumber}-${ep.episodeNumber}`);
		if (!match?.id) continue;
		targets.push({ episodeId: ep.id, tvdbEpisodeId: match.id });
	}
	return targets;
}

/** Normalise a title for fuzzy comparison. */
function normalizeTitle(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Pick the best TVDB search candidate by title (+ optional year). */
export function pickTvdbSeriesMatch(
	results: { id: number; name: string; year?: string | null }[],
	title: string,
	year?: number | null
): number | null {
	const target = normalizeTitle(title);
	if (!target || results.length === 0) return null;

	let best: { id: number; score: number } | null = null;
	for (const r of results) {
		const name = normalizeTitle(r.name);
		if (!name) continue;
		let score = 0;
		if (name === target) score += 1000;
		else if (name.includes(target) || target.includes(name)) score += 200;
		else {
			// token overlap
			const aTokens = new Set(name.split(/[^a-z0-9]+/).filter(Boolean));
			const bTokens = new Set(target.split(/[^a-z0-9]+/).filter(Boolean));
			let shared = 0;
			for (const t of aTokens) if (bTokens.has(t)) shared += 1;
			score += Math.round((shared / Math.max(aTokens.size, bTokens.size, 1)) * 100);
		}
		if (typeof year === 'number' && r.year) {
			const y = parseInt(r.year, 10);
			if (!isNaN(y)) score -= Math.abs(year - y) > 1 ? Math.abs(year - y) * 50 : Math.abs(year - y);
		}
		if (!best || score > best.score) best = { id: r.id, score };
	}

	// Require a reasonable signal to avoid wrong matches
	return best && best.score >= 200 ? best.id : null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class TvdbEpisodeEnrichmentService implements BackgroundService {
	readonly name = 'TvdbEpisodeEnrichmentService';
	private _status: ServiceStatus = 'pending';
	private _error?: Error;
	private config: TvdbEnrichmentConfig;
	private intervalTimer: NodeJS.Timeout | null = null;
	private isRunning = false;
	private lastRunTime: Date | null = null;
	private lastRunSummary: EnrichRunSummary | null = null;

	constructor(config: Partial<TvdbEnrichmentConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	get status(): ServiceStatus {
		return this._status;
	}

	get error(): Error | undefined {
		return this._error;
	}

	start(): void {
		if (this._status === 'ready' || this._status === 'starting') return;

		this._status = 'starting';
		logger.info({ config: this.config }, `[${this.name}] Starting...`);

		setImmediate(() => {
			this.initialize().catch((err) => {
				this._error = err instanceof Error ? err : new Error(String(err));
				this._status = 'error';
				logger.error({ err: this._error }, `[${this.name}] Failed to initialize`);
			});
		});
	}

	async stop(): Promise<void> {
		logger.info(`[${this.name}] Stopping...`);
		if (this.intervalTimer) {
			clearInterval(this.intervalTimer);
			this.intervalTimer = null;
		}
		this._status = 'pending';
		logger.info(`[${this.name}] Stopped`);
	}

	private async initialize(): Promise<void> {
		const intervalMs = this.config.intervalHours * 60 * 60 * 1000;
		this.intervalTimer = setInterval(() => {
			this.runEnrichment().catch((err) => {
				logger.error({ err }, `[${this.name}] Scheduled enrichment failed`);
			});
		}, intervalMs);

		this._status = 'ready';
		logger.info(`[${this.name}] Ready. Interval: ${this.config.intervalHours}h`);

		if (this.config.runOnStartup) {
			setTimeout(() => {
				this.runEnrichment().catch((err) => {
					logger.error({ err }, `[${this.name}] Startup enrichment failed`);
				});
			}, 10000);
		}
	}

	getStatusInfo() {
		let nextRunTime: Date | null = null;
		if (this.lastRunTime && this._status === 'ready') {
			nextRunTime = new Date(
				this.lastRunTime.getTime() + this.config.intervalHours * 60 * 60 * 1000
			);
		}
		return {
			status: this._status,
			lastRunTime: this.lastRunTime,
			lastRunSummary: this.lastRunSummary,
			isRunning: this.isRunning,
			nextRunTime
		};
	}

	async triggerEnrichment(): Promise<EnrichRunSummary> {
		return this.runEnrichment();
	}

	private async runEnrichment(): Promise<EnrichRunSummary> {
		if (this.isRunning) {
			logger.warn(`[${this.name}] Enrichment already in progress, skipping`);
			return this.lastRunSummary ?? { ...NO_GAPS };
		}

		// Gate on TVDB being configured
		const configured = await tvdb.isConfigured().catch(() => false);
		if (!configured) {
			logger.debug(`[${this.name}] TVDB not configured - skipping run`);
			return { ...NO_GAPS };
		}

		this.isRunning = true;
		const startTime = Date.now();
		const summary: EnrichRunSummary = {
			seriesProcessed: 0,
			seriesUpdated: 0,
			episodesFilled: 0,
			episodeExtendedCalls: 0,
			errors: 0,
			skipped: 0,
			duration: 0
		};
		let extendedBudget = this.config.maxEpisodeExtendedCallsPerRun;

		try {
			const candidateSeriesIds = await this.selectCandidateSeries();

			if (candidateSeriesIds.length === 0) {
				logger.debug(`[${this.name}] No series with episode gaps`);
				this.lastRunTime = new Date();
				this.lastRunSummary = { ...summary };
				return this.lastRunSummary;
			}

			logger.info(
				{ candidateCount: candidateSeriesIds.length },
				`[${this.name}] Starting enrichment run`
			);

			for (const seriesId of candidateSeriesIds) {
				try {
					const result = await this.enrichSeries(seriesId, extendedBudget);
					summary.seriesProcessed += 1;
					summary.episodesFilled += result.episodesFilled;
					summary.episodeExtendedCalls += result.extendedCalls;
					extendedBudget -= result.extendedCalls;
					if (result.updated) summary.seriesUpdated += 1;
					if (result.skipped) summary.skipped += 1;
				} catch (err) {
					summary.errors += 1;
					logger.warn(
						{ seriesId, err: err instanceof Error ? err.message : String(err) },
						`[${this.name}] Failed to enrich series`
					);
				}
				await this.delay(this.config.apiDelayMs);
			}

			summary.duration = Date.now() - startTime;
			this.lastRunTime = new Date();
			this.lastRunSummary = summary;

			logger.info(
				{
					seriesProcessed: summary.seriesProcessed,
					seriesUpdated: summary.seriesUpdated,
					episodesFilled: summary.episodesFilled,
					extendedCalls: summary.episodeExtendedCalls,
					errors: summary.errors,
					durationMs: summary.duration
				},
				`[${this.name}] Enrichment run complete`
			);

			return summary;
		} catch (error) {
			summary.errors += 1;
			summary.duration = Date.now() - startTime;
			this.lastRunTime = new Date();
			this.lastRunSummary = summary;
			logger.error({ err: error }, `[${this.name}] Enrichment run failed`);
			throw error;
		} finally {
			this.isRunning = false;
		}
	}

	/** Series ids that have at least one fillable gap (series-level first, episode as filler). */
	private async selectCandidateSeries(): Promise<string[]> {
		const ids = new Set<string>();
		const limit = this.config.batchSize;

		// 1. Series with null air schedule (airs_day / airs_time) — prioritised
		const seriesGapRows = db
			.select({ id: series.id })
			.from(series)
			.where(or(isNull(series.airsDay), isNull(series.airsTime)))
			.limit(limit)
			.all();
		for (const r of seriesGapRows) {
			ids.add(r.id);
			if (ids.size >= limit) break;
		}

		// 2. Series with episode gaps — fill remaining slots
		if (ids.size < limit) {
			const episodeGapRows = db
				.selectDistinct({ seriesId: episodes.seriesId })
				.from(episodes)
				.where(
					or(
						isNull(episodes.title),
						isNull(episodes.overview),
						isNull(episodes.airDate),
						isNull(episodes.runtime),
						isNull(episodes.tvdbId)
					)
				)
				.limit(limit - ids.size)
				.all();
			for (const r of episodeGapRows) {
				ids.add(r.seriesId);
			}
		}

		return Array.from(ids).slice(0, limit);
	}

	private async enrichSeries(
		seriesId: string,
		extendedBudget: number
	): Promise<{
		updated: boolean;
		episodesFilled: number;
		extendedCalls: number;
		skipped: boolean;
	}> {
		const [show] = await db
			.select({
				id: series.id,
				tmdbId: series.tmdbId,
				tvdbId: series.tvdbId,
				title: series.title,
				year: series.year,
				airsDay: series.airsDay,
				airsTime: series.airsTime
			})
			.from(series)
			.where(eq(series.id, seriesId))
			.limit(1);

		if (!show) return { updated: false, episodesFilled: 0, extendedCalls: 0, skipped: true };

		const tvdbId = await this.resolveTvdbId(show).catch((err) => {
			logger.debug(
				{ seriesId, err: err instanceof Error ? err.message : String(err) },
				`[${this.name}] Could not resolve tvdbId`
			);
			return null;
		});
		if (!tvdbId) return { updated: false, episodesFilled: 0, extendedCalls: 0, skipped: true };

		// Persist a newly-resolved series-level tvdbId
		if (show.tvdbId == null && tvdbId != null) {
			await db
				.update(series)
				.set({ tvdbId })
				.where(eq(series.id, show.id))
				.catch(() => {});
		}

		// Series-level enrichment: fill air schedule gaps from TVDB
		let seriesUpdated = false;
		if (show.airsDay == null || show.airsTime == null) {
			try {
				const ext = await tvdb.getSeriesExtended(tvdbId);
				const setSeries: Record<string, unknown> = {};
				if (show.airsDay == null && ext.airsDays) {
					setSeries.airsDay = ext.airsDays;
				}
				if (show.airsTime == null && typeof ext.airsTime === 'string' && ext.airsTime) {
					setSeries.airsTime = ext.airsTime;
				}
				if (Object.keys(setSeries).length > 0) {
					await db.update(series).set(setSeries).where(eq(series.id, show.id));
					seriesUpdated = true;
				}
			} catch (err) {
				logger.debug(
					{ seriesId, err: err instanceof Error ? err.message : String(err) },
					`[${this.name}] Series-level enrichment failed`
				);
			}
		}

		const libraryEpisodes = await db
			.select({
				id: episodes.id,
				seasonNumber: episodes.seasonNumber,
				episodeNumber: episodes.episodeNumber,
				title: episodes.title,
				overview: episodes.overview,
				airDate: episodes.airDate,
				runtime: episodes.runtime,
				tvdbId: episodes.tvdbId
			})
			.from(episodes)
			.where(eq(episodes.seriesId, seriesId));

		if (libraryEpisodes.length === 0) {
			return { updated: false, episodesFilled: 0, extendedCalls: 0, skipped: true };
		}

		const tvdbEpisodes = await this.fetchAllEpisodes(tvdbId);
		const tvdbMap = buildEpisodeMap(tvdbEpisodes);

		let episodesFilled = 0;
		let extendedCalls = 0;

		// Pass 1: cheap fills (airDate / runtime / tvdbId)
		const pass1 = planPass1(libraryEpisodes, tvdbMap);
		for (const update of pass1) {
			const set: Record<string, unknown> = {};
			if (update.airDate !== undefined) set.airDate = update.airDate;
			if (update.runtime !== undefined) set.runtime = update.runtime;
			if (update.tvdbId !== undefined) set.tvdbId = update.tvdbId;
			if (Object.keys(set).length === 0) continue;
			await db.update(episodes).set(set).where(eq(episodes.id, update.episodeId));
			episodesFilled += 1;
		}

		// Pass 2: per-episode text fills (title / overview)
		const targets = planPass2Targets(libraryEpisodes, tvdbMap);
		for (const target of targets) {
			if (extendedBudget <= 0) break;
			try {
				const detail = await tvdb.getEpisodeExtended(target.tvdbEpisodeId);
				extendedCalls += 1;
				extendedBudget -= 1;
				if (!detail) continue;

				const set: Record<string, unknown> = {};
				// Re-read the current row to honour the NULL-only rule (a concurrent
				// TMDB refresh may have populated the field since we planned).
				const [current] = await db
					.select({ title: episodes.title, overview: episodes.overview })
					.from(episodes)
					.where(eq(episodes.id, target.episodeId))
					.limit(1);
				if (!current) continue;
				if (current.title == null && detail.name) {
					set.title = detail.name;
				}
				if (current.overview == null && detail.overview && detail.overview.trim()) {
					set.overview = detail.overview.trim();
				}
				if (Object.keys(set).length > 0) {
					await db.update(episodes).set(set).where(eq(episodes.id, target.episodeId));
					episodesFilled += 1;
				}
			} catch (err) {
				logger.debug(
					{ episodeId: target.episodeId, err: err instanceof Error ? err.message : String(err) },
					`[${this.name}] Failed to fetch extended episode`
				);
			}
			await this.delay(this.config.apiDelayMs);
		}

		return {
			updated: episodesFilled > 0 || seriesUpdated,
			episodesFilled,
			extendedCalls,
			skipped: false
		};
	}

	/** Resolve a tvdbId via: series column -> externalIdCache -> TMDB external ids -> TVDB name search. */
	private async resolveTvdbId(show: {
		id: string;
		tmdbId: number;
		tvdbId: number | null;
		title: string;
		year: number | null;
	}): Promise<number | null> {
		if (show.tvdbId) return show.tvdbId;

		// externalIdCache
		const [cached] = await db
			.select({ tvdbId: externalIdCache.tvdbId })
			.from(externalIdCache)
			.where(and(eq(externalIdCache.tmdbId, show.tmdbId), eq(externalIdCache.mediaType, 'tv')))
			.limit(1);
		if (cached?.tvdbId) return cached.tvdbId;

		// TMDB external ids
		try {
			const ext = await tmdb.getTvExternalIds(show.tmdbId);
			if (ext.tvdb_id) return ext.tvdb_id;
		} catch (err) {
			logger.debug(
				{ tmdbId: show.tmdbId, err: err instanceof Error ? err.message : String(err) },
				`[${this.name}] TMDB external id lookup failed`
			);
		}

		// TVDB name search
		try {
			const results = await tvdb.searchSeries(show.title);
			return pickTvdbSeriesMatch(
				results.map((r) => ({ id: r.id, name: r.name, year: r.year })),
				show.title,
				show.year
			);
		} catch {
			return null;
		}
	}

	/** Fetch every episode in the default (official/aired) order, paging as needed. */
	private async fetchAllEpisodes(tvdbId: number): Promise<TvdbEpisode[]> {
		const all: TvdbEpisode[] = [];
		let page = 0;
		const MAX_PAGES = 60; // safety ceiling (~30k episodes)
		while (page < MAX_PAGES) {
			const result = await tvdb.getEpisodePage(tvdbId, TVDB.DEFAULT_SEASON_TYPE, page);
			all.push(...result.episodes);
			if (!result.hasNext || result.episodes.length === 0) break;
			page += 1;
			await this.delay(this.config.apiDelayMs);
		}
		return all;
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: TvdbEpisodeEnrichmentService | null = null;

export function getTvdbEpisodeEnrichmentService(): TvdbEpisodeEnrichmentService {
	if (!instance) {
		instance = new TvdbEpisodeEnrichmentService();
	}
	return instance;
}
