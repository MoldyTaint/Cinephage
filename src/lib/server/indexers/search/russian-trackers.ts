/**
 * Russian tracker utilities.
 *
 * Russian trackers (RuTracker, Kinozal, etc.) need special handling:
 * - Single-lane queued searching to respect per-request throttling requirements
 * - Per-request rate limiting (every ~3 seconds minimum)
 * - Limited to 2 titles per automatic season search to avoid hammering
 * - Season-packs are pointer-ized (treated as individual episode results)
 * - Autumn search cache to avoid re-querying the same season within TTL
 */

import type { IIndexer } from '../types';

export const RUSSIAN_TRACKER_NAMES = [
	'rutracker',
	'kinozal',
	'rutor',
	'nnmclub',
	'nnm-club',
	'noname club',
	'rustorka'
];

export const RUTRACKER_AUTOMATIC_MAX_TITLES = 2;

export const RUTRACKER_AUTOMATIC_SEASON_CACHE_TTL_MS = 3 * 60_000;

export function prefersNativeCyrillicTitles(indexer: IIndexer): boolean {
	const name = (indexer.name ?? '').toLowerCase();
	if (RUSSIAN_TRACKER_NAMES.some((t) => name.includes(t))) return true;
	try {
		const hostname = new URL(indexer.baseUrl).hostname.toLowerCase();
		return hostname.endsWith('.ru') || hostname.includes('.ru.');
	} catch {
		return false;
	}
}

export function isRuTrackerIndexerName(indexerName: string | undefined): boolean {
	if (!indexerName) return false;
	const normalized = indexerName.toLowerCase();
	return normalized.includes('rutracker') || normalized.includes('kinozal');
}

export function isRuTrackerHost(baseUrl: string | undefined): boolean {
	if (!baseUrl) return false;
	const normalized = baseUrl.toLowerCase();
	try {
		const hostname = new URL(baseUrl).hostname.toLowerCase();
		return hostname.includes('rutracker.') || hostname.includes('kinozal.');
	} catch {
		return normalized.includes('rutracker.') || normalized.includes('kinozal.');
	}
}

export function isRuTrackerRelease(indexerName: string | undefined): boolean {
	return isRuTrackerIndexerName(indexerName);
}
