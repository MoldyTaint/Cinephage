/**
 * Cinephage IPTV Countries API
 *
 * GET /api/livetv/cinephage-iptv/countries - List all IPTV countries from Cinephage API
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logger } from '$lib/logging';
import { getCountries, type CinephageIptvCountry } from '$lib/server/cinephage';

const CACHE_TTL = 24 * 60 * 60 * 1000;

interface CachedData {
	data: CinephageIptvCountry[];
	fetchedAt: number;
}

let cachedCountries: CachedData | null = null;

async function getCachedCountries(): Promise<CinephageIptvCountry[]> {
	if (cachedCountries && Date.now() - cachedCountries.fetchedAt < CACHE_TTL) {
		return cachedCountries.data;
	}

	logger.info('[CinephageCountries] Fetching countries data from Cinephage API');

	let countries: CinephageIptvCountry[];
	try {
		countries = await getCountries();
	} catch (error) {
		if (cachedCountries) {
			logger.warn({ err: error }, '[CinephageCountries] Fetch failed, serving stale cache');
			return cachedCountries.data;
		}
		throw error;
	}

	countries.sort((a, b) => a.name.localeCompare(b.name));
	cachedCountries = { data: countries, fetchedAt: Date.now() };

	logger.info({ count: countries.length }, '[CinephageCountries] Cached countries data');
	return countries;
}

export const GET: RequestHandler = async () => {
	try {
		const countries = await getCachedCountries();

		return json({
			success: true,
			countries: countries.map((c) => ({
				code: c.code,
				name: c.name,
				flag: c.flag || ''
			})),
			cached: cachedCountries !== null && Date.now() - cachedCountries.fetchedAt < CACHE_TTL,
			count: countries.length
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error({ error: message }, '[CinephageCountries] Failed to fetch countries');

		return json({ success: false, error: message }, { status: 500 });
	}
};
