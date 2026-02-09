/**
 * IPTV-Org Countries API
 *
 * GET /api/livetv/iptvorg/countries - List all countries from IPTV-Org
 * Cached for 24 hours to avoid hitting their API too frequently
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logger } from '$lib/logging';

interface IptvOrgCountry {
	name: string;
	code: string;
	languages: string[];
	flag: string;
}

interface CachedData {
	data: IptvOrgCountry[];
	fetchedAt: number;
}

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const IPTVORG_API_BASE = 'https://iptv-org.github.io/api';

let cachedCountries: CachedData | null = null;

async function fetchCountries(): Promise<IptvOrgCountry[]> {
	const response = await fetch(`${IPTVORG_API_BASE}/countries.json`, {
		headers: {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
		},
		signal: AbortSignal.timeout(30000)
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch countries: HTTP ${response.status}`);
	}

	return response.json();
}

async function getCachedCountries(): Promise<IptvOrgCountry[]> {
	// Return cached data if still valid
	if (cachedCountries && Date.now() - cachedCountries.fetchedAt < CACHE_TTL) {
		return cachedCountries.data;
	}

	// Fetch fresh data
	logger.info('[IptvOrgCountries] Fetching fresh countries data from IPTV-Org API');
	const countries = await fetchCountries();

	// Sort by name
	countries.sort((a, b) => a.name.localeCompare(b.name));

	// Update cache
	cachedCountries = {
		data: countries,
		fetchedAt: Date.now()
	};

	logger.info('[IptvOrgCountries] Cached countries data', { count: countries.length });
	return countries;
}

/**
 * List all countries from IPTV-Org
 */
export const GET: RequestHandler = async () => {
	try {
		const countries = await getCachedCountries();

		return json({
			success: true,
			countries: countries.map((c) => ({
				code: c.code,
				name: c.name,
				flag: c.flag
			})),
			cached: cachedCountries ? Date.now() - cachedCountries.fetchedAt < CACHE_TTL : false,
			count: countries.length
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error('[IptvOrgCountries] Failed to fetch countries', { error: message });

		return json(
			{
				success: false,
				error: message
			},
			{ status: 500 }
		);
	}
};
