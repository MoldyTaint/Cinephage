import { getCinephageBackendConfig } from '../config.js';
import { cinephageRequestWithConfig } from '../client.js';

const NOT_CONFIGURED_ERROR =
	'Cinephage API not configured: missing cinephageVersion or cinephageCommit';

export interface CinephageIptvCountry {
	code: string;
	name: string;
	channel_count?: number;
	flag?: string | null;
	languages?: string | null;
}

export async function getCountries(): Promise<CinephageIptvCountry[]> {
	const config = await getCinephageBackendConfig();
	if (!config.configured) {
		throw new Error(NOT_CONFIGURED_ERROR);
	}

	const response = await cinephageRequestWithConfig(config, '/api/v1/iptv/countries');
	const data = JSON.parse(response.body) as { countries?: CinephageIptvCountry[] };

	if (!data.countries || !Array.isArray(data.countries)) {
		throw new Error('Unexpected response format from Cinephage API');
	}

	return data.countries;
}

export async function getPlaylist(params: {
	countries?: string[];
	categories?: string[];
}): Promise<string> {
	const config = await getCinephageBackendConfig();
	if (!config.configured) {
		throw new Error(NOT_CONFIGURED_ERROR);
	}

	const response = await cinephageRequestWithConfig(config, '/api/v1/iptv/playlist.m3u', {
		query: {
			country: params.countries && params.countries.length > 0 ? params.countries : undefined,
			category: params.categories && params.categories.length > 0 ? params.categories : undefined
		},
		accept: 'audio/x-mpegurl, text/plain, */*'
	});

	return response.body;
}

export async function getChannelCount(params: {
	limit?: number;
	country?: string;
}): Promise<number> {
	const config = await getCinephageBackendConfig();
	if (!config.configured) {
		throw new Error(NOT_CONFIGURED_ERROR);
	}

	const response = await cinephageRequestWithConfig(config, '/api/v1/iptv/channels', {
		query: { limit: params.limit ?? 1, country: params.country }
	});

	const data = JSON.parse(response.body) as { total?: number };
	return typeof data.total === 'number' ? data.total : 0;
}
